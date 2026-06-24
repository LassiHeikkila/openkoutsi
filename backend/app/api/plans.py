from datetime import date, datetime, time, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.deps import get_ctx_and_session
from backend.app.db.registry import get_registry_session
from backend.app.models.registry_orm import ProviderConnection, Team
from backend.app.models.team_orm import (
    Athlete, TrainingPlan, PlannedWorkout, WahooWorkoutUpload, WorkoutDefinition,
)
from backend.app.models.team_orm import Activity
from backend.app.schemas.plans import (
    TrainingPlanCreate, TrainingPlanUpdate, TrainingPlanResponse,
    LinkActivityRequest, PlannedWorkoutResponse, SkipWorkoutRequest,
    PlannedWorkoutCreate, PlannedWorkoutUpdate, RegeneratePlanRequest,
    PushUpcomingWahooRequest, PushUpcomingWahooResponse, PushUpcomingResultItem,
)
from backend.app.services.plan_generator import generate_plan, build_workout_rows
from backend.app.services.llm_plan_generator import generate_plan_llm, generate_plan_weeks_llm
from backend.app.services.llm_workout_generator import (
    generate_workout_definition_llm, WorkoutGenerationError,
)
from backend.app.services.provider_sync import ensure_fresh_token
from backend.app.services.providers.wahoo import WahooClient, workout_type_id_for
from openkoutsi.workout_formats.wahoo_plan import build_wahoo_plan

router = APIRouter(prefix="/plans", tags=["plans"])

# Wahoo only displays plans attached to a workout scheduled today → +6 days.
_WAHOO_VISIBILITY_DAYS = 6


def _planned_date(start_date, week_number: int, day_of_week: int):
    """Map a planned workout's (week, day) to an absolute calendar date."""
    return start_date + timedelta(days=(week_number - 1) * 7 + (day_of_week - 1))


async def _get_athlete(global_user_id: str, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.global_user_id == global_user_id))
    athlete = result.scalar_one_or_none()
    if not athlete:
        raise HTTPException(404, "Athlete profile not found")
    return athlete


@router.get("/", response_model=list[TrainingPlanResponse])
async def list_plans(ctx_session=Depends(get_ctx_and_session)):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    result = await session.execute(
        select(TrainingPlan)
        .where(TrainingPlan.athlete_id == athlete.id)
        .options(selectinload(TrainingPlan.workouts))
        .order_by(TrainingPlan.created_at.desc())
    )
    plans = result.scalars().all()
    return [TrainingPlanResponse.model_validate(p) for p in plans]


@router.post("/", response_model=TrainingPlanResponse, status_code=201)
async def create_plan(
    body: TrainingPlanCreate,
    ctx_session=Depends(get_ctx_and_session),
    registry_session: AsyncSession = Depends(get_registry_session),
):
    ctx, session = ctx_session

    athlete = await _get_athlete(ctx.user_id, session)

    # Archive any existing active plans
    result = await session.execute(
        select(TrainingPlan)
        .where(TrainingPlan.athlete_id == athlete.id, TrainingPlan.status == "active")
    )
    for old in result.scalars().all():
        old.status = "archived"
    await session.flush()

    if body.llm_weeks:
        # Frontend already called the LLM — persist the pre-built weeks directly.
        end_date = body.start_date + timedelta(weeks=body.weeks) - timedelta(days=1)
        plan = TrainingPlan(
            athlete_id=athlete.id,
            name=body.name,
            start_date=body.start_date,
            end_date=end_date,
            goal=body.goal,
            weeks=body.weeks,
            status="active",
            config=body.config.model_dump() if body.config else None,
            generation_method="llm",
        )
        session.add(plan)
        await session.flush()

        for week_num, week_days in enumerate(body.llm_weeks, start=1):
            for day in week_days:
                session.add(PlannedWorkout(
                    plan_id=plan.id,
                    week_number=week_num,
                    day_of_week=day.day_of_week,
                    workout_type=day.workout_type,
                    description=day.description,
                    duration_min=day.duration_min,
                    target_tss=day.target_tss,
                ))
        await session.commit()
        await session.refresh(plan)
    elif body.use_llm:
        if not body.config:
            raise HTTPException(400, "A plan config (training days and types) is required for LLM generation")
        team_result = await registry_session.execute(select(Team).where(Team.id == ctx.team_id))
        team = team_result.scalar_one_or_none()
        try:
            plan = await generate_plan_llm(
                athlete=athlete,
                config=body.config,
                name=body.name,
                start_date=body.start_date,
                num_weeks=body.weeks,
                goal=body.goal,
                session=session,
                team=team,
                team_id=ctx.team_id,
                user_id=ctx.user_id,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(503, f"LLM plan generation failed: {exc}") from exc
    else:
        plan = await generate_plan(
            athlete_id=athlete.id,
            name=body.name,
            start_date=body.start_date,
            num_weeks=body.weeks,
            goal=body.goal,
            session=session,
            config=body.config,
        )

    # Reload with workouts
    result = await session.execute(
        select(TrainingPlan)
        .where(TrainingPlan.id == plan.id)
        .options(selectinload(TrainingPlan.workouts))
    )
    plan = result.scalar_one()
    return TrainingPlanResponse.model_validate(plan)


@router.get("/{plan_id}", response_model=TrainingPlanResponse)
async def get_plan(
    plan_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    result = await session.execute(
        select(TrainingPlan)
        .where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
        .options(selectinload(TrainingPlan.workouts))
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(404, "Plan not found")
    return TrainingPlanResponse.model_validate(plan)


@router.put("/{plan_id}", response_model=TrainingPlanResponse)
async def update_plan(
    plan_id: str,
    body: TrainingPlanUpdate,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    result = await session.execute(
        select(TrainingPlan)
        .where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
        .options(selectinload(TrainingPlan.workouts))
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(404, "Plan not found")

    if body.status is not None:
        plan.status = body.status
    if body.name is not None:
        plan.name = body.name
    if body.goal is not None:
        plan.goal = body.goal
    if body.start_date is not None:
        plan.start_date = body.start_date
    if body.weeks is not None:
        plan.weeks = body.weeks

    # Recompute end_date when the start date or duration changed.
    if (body.start_date is not None or body.weeks is not None) and plan.start_date and plan.weeks:
        plan.end_date = plan.start_date + timedelta(weeks=plan.weeks) - timedelta(days=1)

    await session.commit()
    await session.refresh(plan)
    return TrainingPlanResponse.model_validate(plan)


@router.put("/{plan_id}/workouts/{workout_id}/link", response_model=PlannedWorkoutResponse)
async def link_workout_to_activity(
    plan_id: str,
    workout_id: str,
    body: LinkActivityRequest,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    plan_result = await session.execute(
        select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
    )
    if not plan_result.scalar_one_or_none():
        raise HTTPException(404, "Plan not found")

    workout_result = await session.execute(
        select(PlannedWorkout).where(PlannedWorkout.id == workout_id, PlannedWorkout.plan_id == plan_id)
    )
    workout = workout_result.scalar_one_or_none()
    if not workout:
        raise HTTPException(404, "Planned workout not found")

    activity_result = await session.execute(
        select(Activity).where(Activity.id == body.activity_id, Activity.athlete_id == athlete.id)
    )
    if not activity_result.scalar_one_or_none():
        raise HTTPException(404, "Activity not found")

    # Reject if this activity is already linked to a different planned workout
    existing_link_result = await session.execute(
        select(PlannedWorkout).where(
            PlannedWorkout.completed_activity_id == body.activity_id,
            PlannedWorkout.id != workout_id,
        )
    )
    if existing_link_result.scalar_one_or_none():
        raise HTTPException(409, "Activity is already linked to another planned workout")

    workout.completed_activity_id = body.activity_id
    await session.commit()
    await session.refresh(workout)
    return PlannedWorkoutResponse.model_validate(workout)


@router.delete("/{plan_id}/workouts/{workout_id}/link", status_code=204)
async def unlink_workout_from_activity(
    plan_id: str,
    workout_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    plan_result = await session.execute(
        select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
    )
    if not plan_result.scalar_one_or_none():
        raise HTTPException(404, "Plan not found")

    workout_result = await session.execute(
        select(PlannedWorkout).where(PlannedWorkout.id == workout_id, PlannedWorkout.plan_id == plan_id)
    )
    workout = workout_result.scalar_one_or_none()
    if not workout:
        raise HTTPException(404, "Planned workout not found")

    workout.completed_activity_id = None
    await session.commit()


@router.put("/{plan_id}/workouts/{workout_id}/skip", response_model=PlannedWorkoutResponse)
async def skip_workout(
    plan_id: str,
    workout_id: str,
    body: SkipWorkoutRequest,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    plan_result = await session.execute(
        select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
    )
    if not plan_result.scalar_one_or_none():
        raise HTTPException(404, "Plan not found")

    workout_result = await session.execute(
        select(PlannedWorkout).where(PlannedWorkout.id == workout_id, PlannedWorkout.plan_id == plan_id)
    )
    workout = workout_result.scalar_one_or_none()
    if not workout:
        raise HTTPException(404, "Planned workout not found")

    if workout.completed_activity_id is not None:
        raise HTTPException(409, "Cannot skip a workout that has already been completed")

    workout.skip_reason = body.reason
    await session.commit()
    await session.refresh(workout)
    return PlannedWorkoutResponse.model_validate(workout)


@router.delete("/{plan_id}/workouts/{workout_id}/skip", status_code=204)
async def clear_workout_skip(
    plan_id: str,
    workout_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    plan_result = await session.execute(
        select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
    )
    if not plan_result.scalar_one_or_none():
        raise HTTPException(404, "Plan not found")

    workout_result = await session.execute(
        select(PlannedWorkout).where(PlannedWorkout.id == workout_id, PlannedWorkout.plan_id == plan_id)
    )
    workout = workout_result.scalar_one_or_none()
    if not workout:
        raise HTTPException(404, "Planned workout not found")

    workout.skip_reason = None
    await session.commit()


@router.post("/{plan_id}/workouts", response_model=PlannedWorkoutResponse, status_code=201)
async def add_workout(
    plan_id: str,
    body: PlannedWorkoutCreate,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    plan_result = await session.execute(
        select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
    )
    if not plan_result.scalar_one_or_none():
        raise HTTPException(404, "Plan not found")

    workout = PlannedWorkout(
        plan_id=plan_id,
        week_number=body.week_number,
        day_of_week=body.day_of_week,
        workout_type=body.workout_type,
        description=body.description,
        duration_min=body.duration_min,
        target_tss=body.target_tss,
    )
    session.add(workout)
    await session.commit()
    await session.refresh(workout)
    return PlannedWorkoutResponse.model_validate(workout)


@router.put("/{plan_id}/workouts/{workout_id}", response_model=PlannedWorkoutResponse)
async def update_workout(
    plan_id: str,
    workout_id: str,
    body: PlannedWorkoutUpdate,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    plan_result = await session.execute(
        select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
    )
    if not plan_result.scalar_one_or_none():
        raise HTTPException(404, "Plan not found")

    workout_result = await session.execute(
        select(PlannedWorkout).where(PlannedWorkout.id == workout_id, PlannedWorkout.plan_id == plan_id)
    )
    workout = workout_result.scalar_one_or_none()
    if not workout:
        raise HTTPException(404, "Planned workout not found")

    if workout.completed_activity_id is not None:
        raise HTTPException(409, "Cannot edit a workout that has already been completed")

    for field in ("workout_type", "description", "duration_min", "target_tss", "day_of_week", "week_number"):
        value = getattr(body, field)
        if value is not None:
            setattr(workout, field, value)

    await session.commit()
    await session.refresh(workout)
    return PlannedWorkoutResponse.model_validate(workout)


@router.delete("/{plan_id}/workouts/{workout_id}", status_code=204)
async def delete_workout(
    plan_id: str,
    workout_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    plan_result = await session.execute(
        select(TrainingPlan).where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
    )
    if not plan_result.scalar_one_or_none():
        raise HTTPException(404, "Plan not found")

    workout_result = await session.execute(
        select(PlannedWorkout).where(PlannedWorkout.id == workout_id, PlannedWorkout.plan_id == plan_id)
    )
    workout = workout_result.scalar_one_or_none()
    if not workout:
        raise HTTPException(404, "Planned workout not found")

    if workout.completed_activity_id is not None:
        raise HTTPException(409, "Cannot delete a workout that has already been completed")

    await session.delete(workout)
    await session.commit()


@router.post("/{plan_id}/regenerate", response_model=TrainingPlanResponse)
async def regenerate_plan(
    plan_id: str,
    body: RegeneratePlanRequest,
    ctx_session=Depends(get_ctx_and_session),
    registry_session: AsyncSession = Depends(get_registry_session),
):
    """Replace a plan's workouts, preserving any already linked to a completed activity."""
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    result = await session.execute(
        select(TrainingPlan)
        .where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
        .options(selectinload(TrainingPlan.workouts))
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(404, "Plan not found")

    num_weeks = body.weeks if body.weeks is not None else (plan.weeks or 8)
    goal = body.goal if body.goal is not None else plan.goal

    # Preserve completed workouts; drop everything else and rebuild.
    preserved: list[PlannedWorkout] = []
    for pw in list(plan.workouts):
        if pw.completed_activity_id is not None:
            preserved.append(pw)
        else:
            await session.delete(pw)
    await session.flush()

    occupied = {(pw.week_number, pw.day_of_week) for pw in preserved}

    if body.llm_weeks:
        plan.generation_method = "llm"
        for week_num, week_days in enumerate(body.llm_weeks, start=1):
            for day in week_days:
                if (week_num, day.day_of_week) in occupied:
                    continue
                session.add(PlannedWorkout(
                    plan_id=plan.id,
                    week_number=week_num,
                    day_of_week=day.day_of_week,
                    workout_type=day.workout_type,
                    description=day.description,
                    duration_min=day.duration_min,
                    target_tss=day.target_tss,
                ))
    elif body.use_llm:
        if not body.config:
            raise HTTPException(400, "A plan config (training days and types) is required for LLM generation")
        team_result = await registry_session.execute(select(Team).where(Team.id == ctx.team_id))
        team = team_result.scalar_one_or_none()
        try:
            weeks_data = await generate_plan_weeks_llm(
                athlete=athlete,
                config=body.config,
                num_weeks=num_weeks,
                goal=goal,
                session=session,
                team=team,
                team_id=ctx.team_id,
                user_id=ctx.user_id,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(503, f"LLM plan generation failed: {exc}") from exc
        plan.generation_method = "llm"
        for week_num, week_days in enumerate(weeks_data, start=1):
            for day in week_days:
                if (week_num, day["day_of_week"]) in occupied:
                    continue
                session.add(PlannedWorkout(plan_id=plan.id, week_number=week_num, **day))
    else:
        plan.generation_method = "rule_based"
        for pw in build_workout_rows(plan.id, num_weeks, goal, body.config):
            if (pw.week_number, pw.day_of_week) in occupied:
                continue
            session.add(pw)

    plan.weeks = num_weeks
    plan.goal = goal
    if body.config is not None:
        plan.config = body.config.model_dump()
    if plan.start_date:
        plan.end_date = plan.start_date + timedelta(weeks=num_weeks) - timedelta(days=1)

    await session.commit()

    result = await session.execute(
        select(TrainingPlan)
        .where(TrainingPlan.id == plan.id)
        .options(selectinload(TrainingPlan.workouts))
    )
    plan = result.scalar_one()
    return TrainingPlanResponse.model_validate(plan)


@router.post("/{plan_id}/push-upcoming/wahoo", response_model=PushUpcomingWahooResponse)
async def push_upcoming_to_wahoo(
    plan_id: str,
    body: PushUpcomingWahooRequest,
    ctx_session=Depends(get_ctx_and_session),
    registry_session: AsyncSession = Depends(get_registry_session),
):
    """Synthesize structured workouts for the plan's upcoming days and push them to Wahoo.

    For each planned workout falling within Wahoo's today→+6 visibility window
    (rest days and unstructured rows excluded), ensure a structured
    ``WorkoutDefinition`` exists — generating one via the LLM and caching it on
    ``PlannedWorkout.workout_definition_id`` when missing — then create/update a
    Wahoo plan + scheduled workout pair (mirroring the single-workout push from
    #114). Returns a per-workout summary.
    """
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    result = await session.execute(
        select(TrainingPlan)
        .where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
        .options(selectinload(TrainingPlan.workouts))
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(404, "Plan not found")
    if not plan.start_date:
        raise HTTPException(400, "Plan has no start date")

    # Resolve the Wahoo connection and a fresh access token.
    conn_result = await registry_session.execute(
        select(ProviderConnection).where(
            ProviderConnection.user_id == ctx.user_id,
            ProviderConnection.provider == "wahoo",
        )
    )
    conn = conn_result.scalar_one_or_none()
    if conn is None:
        raise HTTPException(status_code=400, detail="wahoo is not connected")
    access_token = await ensure_fresh_token(conn, registry_session)

    # Compute the [start, end] selection window, clamped to today→+6 days.
    today = datetime.now(timezone.utc).date()
    window_start = today
    window_end = today + timedelta(days=_WAHOO_VISIBILITY_DAYS)
    if body.start and body.start > window_start:
        window_start = body.start
    if body.end and body.end < window_end:
        window_end = body.end

    team_result = await registry_session.execute(select(Team).where(Team.id == ctx.team_id))
    team = team_result.scalar_one_or_none()

    # Select in-window planned workouts, ordered by date.
    selected: list[tuple[PlannedWorkout, date]] = []
    for pw in plan.workouts:
        pdate = _planned_date(plan.start_date, pw.week_number, pw.day_of_week)
        if window_start <= pdate <= window_end:
            selected.append((pw, pdate))
    selected.sort(key=lambda item: item[1])

    client = WahooClient()
    results: list[PushUpcomingResultItem] = []

    for pw, pdate in selected:
        wtype = (pw.workout_type or "").lower()
        if wtype in ("", "rest") or (pw.duration_min is None and pw.target_tss is None):
            results.append(PushUpcomingResultItem(
                planned_workout_id=pw.id, date=pdate, workout_type=pw.workout_type,
                status="skipped", reason="rest_or_unstructured",
            ))
            continue

        # Reuse a cached definition unless missing or a refresh was requested.
        workout: WorkoutDefinition | None = None
        if pw.workout_definition_id and not body.refresh:
            wd_result = await session.execute(
                select(WorkoutDefinition).where(
                    WorkoutDefinition.id == pw.workout_definition_id,
                    WorkoutDefinition.athlete_id == athlete.id,
                )
            )
            workout = wd_result.scalar_one_or_none()

        if workout is None:
            try:
                workout = await generate_workout_definition_llm(
                    athlete=athlete,
                    planned_workout=pw,
                    session=session,
                    team=team,
                    team_id=ctx.team_id,
                    user_id=ctx.user_id,
                )
            except ValueError as exc:
                # LLM not configured — no workout can be generated; fail clearly.
                raise HTTPException(400, str(exc)) from exc
            except WorkoutGenerationError as exc:
                results.append(PushUpcomingResultItem(
                    planned_workout_id=pw.id, date=pdate, workout_type=pw.workout_type,
                    status="failed", reason=f"generation_failed: {exc}",
                ))
                continue
            except httpx.HTTPError:
                # Transient LLM connectivity/HTTP error — skip this day, keep the batch going.
                results.append(PushUpcomingResultItem(
                    planned_workout_id=pw.id, date=pdate, workout_type=pw.workout_type,
                    status="failed", reason="generation_failed: llm_unavailable",
                ))
                continue

        external_id = f"okoutsi-pw-{pw.id}"
        starts = datetime.combine(pdate, time(12, 0), tzinfo=timezone.utc)

        upload_result = await session.execute(
            select(WahooWorkoutUpload).where(
                WahooWorkoutUpload.athlete_id == athlete.id,
                WahooWorkoutUpload.external_id == external_id,
            )
        )
        upload = upload_result.scalar_one_or_none()

        plan_json = build_wahoo_plan(
            steps=workout.steps,
            workout_name=workout.name,
            workout_description=workout.description,
            sport_type=workout.sport_type,
            athlete_ftp=athlete.ftp,
            athlete_power_zones=athlete.power_zones,
        )
        minutes = max(1, round((workout.estimated_duration_s or 0) / 60)) or 1

        try:
            wahoo_plan_id = await client.create_or_update_plan(
                access_token,
                plan_json=plan_json,
                external_id=external_id,
                provider_updated_at=workout.updated_at,
                filename=f"{external_id}.json",
            )
            wahoo_workout_id = await client.create_or_update_workout(
                access_token,
                name=workout.name,
                workout_token=external_id,
                workout_type_id=workout_type_id_for(workout.sport_type),
                starts=starts,
                minutes=minutes,
                plan_id=wahoo_plan_id,
                existing_id=upload.wahoo_workout_id if upload else None,
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (401, 403):
                # An auth/scope failure affects every push — persist any workouts
                # generated so far and surface the reconnect signal, as in #114.
                await session.commit()
                raise HTTPException(status_code=403, detail="insufficient_scope")
            results.append(PushUpcomingResultItem(
                planned_workout_id=pw.id, date=pdate, workout_type=pw.workout_type,
                status="failed", reason="wahoo_error",
            ))
            continue

        if upload is None:
            upload = WahooWorkoutUpload(
                athlete_id=athlete.id,
                workout_definition_id=workout.id,
                external_id=external_id,
            )
            session.add(upload)
        upload.workout_definition_id = workout.id
        upload.wahoo_plan_id = wahoo_plan_id
        upload.wahoo_workout_id = wahoo_workout_id
        upload.starts = starts
        upload.provider_updated_at = workout.updated_at

        results.append(PushUpcomingResultItem(
            planned_workout_id=pw.id, date=pdate, workout_type=pw.workout_type,
            status="pushed",
        ))

    await session.commit()
    return PushUpcomingWahooResponse(results=results)


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    result = await session.execute(
        select(TrainingPlan)
        .where(TrainingPlan.id == plan_id, TrainingPlan.athlete_id == athlete.id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(404, "Plan not found")
    await session.delete(plan)
    await session.commit()
