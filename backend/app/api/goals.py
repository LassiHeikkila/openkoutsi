import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.db.base import get_session
from backend.app.models.orm import Athlete, Goal, User
from backend.app.schemas.goals import GoalCreate, GoalResponse, GoalUpdate

router = APIRouter(prefix="/goals", tags=["goals"])


async def _get_athlete(user: User, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")
    return athlete


@router.get("/", response_model=list[GoalResponse])
async def list_goals(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)
    result = await session.execute(
        select(Goal)
        .where(Goal.athlete_id == athlete.id)
        .order_by(Goal.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=GoalResponse, status_code=201)
async def create_goal(
    body: GoalCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)
    goal = Goal(id=str(uuid.uuid4()), athlete_id=athlete.id, **body.model_dump())
    session.add(goal)
    await session.commit()
    await session.refresh(goal)
    return goal


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)
    result = await session.execute(
        select(Goal).where(Goal.id == goal_id, Goal.athlete_id == athlete.id)
    )
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)

    await session.commit()
    await session.refresh(goal)
    return goal


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(
    goal_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)
    result = await session.execute(
        select(Goal).where(Goal.id == goal_id, Goal.athlete_id == athlete.id)
    )
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    await session.delete(goal)
    await session.commit()
