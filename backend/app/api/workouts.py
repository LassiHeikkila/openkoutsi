import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.deps import get_ctx_and_session
from backend.app.models.team_orm import Athlete, WorkoutDefinition
from backend.app.schemas.workouts import (
    ExportFormatInfo,
    WorkoutDefinitionCreate,
    WorkoutDefinitionResponse,
    WorkoutDefinitionUpdate,
)
from openkoutsi.workout_estimator import estimate_duration_s, estimate_tss
from openkoutsi.workout_formats.registry import EXPORTERS
from openkoutsi.workout_schema import WorkoutStepOrRepeat

router = APIRouter(prefix="/workouts", tags=["workouts"])


async def _get_athlete(global_user_id: str, session: AsyncSession) -> Athlete:
    result = await session.execute(
        select(Athlete).where(Athlete.global_user_id == global_user_id)
    )
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")
    return athlete


async def _get_workout(
    workout_id: str, athlete_id: str, session: AsyncSession
) -> WorkoutDefinition:
    result = await session.execute(
        select(WorkoutDefinition).where(
            WorkoutDefinition.id == workout_id,
            WorkoutDefinition.athlete_id == athlete_id,
        )
    )
    workout = result.scalar_one_or_none()
    if workout is None:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout


def _validate_steps(steps_raw: list[WorkoutStepOrRepeat]) -> list[dict]:
    """Validate and serialise steps, enforcing max repeat-nesting depth of 1."""
    from openkoutsi.workout_schema import RepeatBlock

    for step in steps_raw:
        if isinstance(step, RepeatBlock) and step.max_depth() > 1:
            raise HTTPException(
                status_code=422,
                detail="Repeat blocks may not contain nested repeat blocks.",
            )
    return [s.model_dump() for s in steps_raw]


@router.get("/export/formats", response_model=list[ExportFormatInfo])
async def list_export_formats():
    return [
        ExportFormatInfo(
            key=cls.meta.key,
            label=cls.meta.label,
            file_extension=cls.meta.file_extension,
            mime_type=cls.meta.mime_type,
        )
        for cls in EXPORTERS.values()
    ]


@router.get("/", response_model=list[WorkoutDefinitionResponse])
async def list_workouts(ctx_session=Depends(get_ctx_and_session)):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    result = await session.execute(
        select(WorkoutDefinition)
        .where(WorkoutDefinition.athlete_id == athlete.id)
        .order_by(WorkoutDefinition.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=WorkoutDefinitionResponse, status_code=201)
async def create_workout(
    body: WorkoutDefinitionCreate,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    steps = _validate_steps(body.steps)
    workout = WorkoutDefinition(
        id=str(uuid.uuid4()),
        athlete_id=athlete.id,
        name=body.name,
        description=body.description,
        sport_type=body.sport_type,
        steps=steps,
        estimated_duration_s=estimate_duration_s(steps),
        estimated_tss=estimate_tss(steps, athlete.ftp),
    )
    session.add(workout)
    await session.commit()
    await session.refresh(workout)
    return workout


@router.get("/{workout_id}", response_model=WorkoutDefinitionResponse)
async def get_workout(
    workout_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    return await _get_workout(workout_id, athlete.id, session)


@router.put("/{workout_id}", response_model=WorkoutDefinitionResponse)
async def update_workout(
    workout_id: str,
    body: WorkoutDefinitionUpdate,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    workout = await _get_workout(workout_id, athlete.id, session)

    update = body.model_dump(exclude_unset=True)
    if "steps" in update:
        update["steps"] = _validate_steps(body.steps)
        update["estimated_duration_s"] = estimate_duration_s(update["steps"])
        update["estimated_tss"] = estimate_tss(update["steps"], athlete.ftp)

    for field, value in update.items():
        setattr(workout, field, value)

    await session.commit()
    await session.refresh(workout)
    return workout


@router.delete("/{workout_id}", status_code=204)
async def delete_workout(
    workout_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    workout = await _get_workout(workout_id, athlete.id, session)
    await session.delete(workout)
    await session.commit()


@router.get("/{workout_id}/export/{format_key}")
async def export_workout(
    workout_id: str,
    format_key: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    workout = await _get_workout(workout_id, athlete.id, session)

    exporter_cls = EXPORTERS.get(format_key)
    if exporter_cls is None:
        raise HTTPException(status_code=404, detail=f"Unknown export format: {format_key}")

    exporter = exporter_cls()
    try:
        data = exporter.export(
            steps=workout.steps,
            workout_name=workout.name,
            workout_description=workout.description,
            athlete_ftp=athlete.ftp,
            athlete_power_zones=athlete.power_zones,
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    safe_name = "".join(c if c.isalnum() or c in "-_ " else "_" for c in workout.name)
    filename = f"{safe_name}.{exporter_cls.meta.file_extension}"
    return Response(
        content=data,
        media_type=exporter_cls.meta.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
