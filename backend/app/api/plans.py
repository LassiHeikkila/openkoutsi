from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.deps import get_ctx_and_session
from backend.app.core.config import settings
from backend.app.models.team_orm import Athlete, TrainingPlan, PlannedWorkout
from backend.app.schemas.plans import TrainingPlanCreate, TrainingPlanUpdate, TrainingPlanResponse
from backend.app.services.plan_generator import generate_plan
from backend.app.services.llm_plan_generator import generate_plan_llm

router = APIRouter(prefix="/plans", tags=["plans"])


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
):
    ctx, session = ctx_session
    if body.use_llm and not body.llm_weeks and not settings.llm_base_url:
        raise HTTPException(400, "LLM generation is not configured (LLM_BASE_URL is not set)")

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
        try:
            plan = await generate_plan_llm(
                athlete=athlete,
                config=body.config,
                name=body.name,
                start_date=body.start_date,
                num_weeks=body.weeks,
                goal=body.goal,
                session=session,
            )
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

    await session.commit()
    await session.refresh(plan)
    return TrainingPlanResponse.model_validate(plan)


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
