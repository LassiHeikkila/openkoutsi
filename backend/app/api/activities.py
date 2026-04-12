import uuid
from datetime import date, datetime, time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.core.config import settings
from backend.app.db.base import get_session, AsyncSessionLocal
from backend.app.models.orm import Activity, ActivityStream, Athlete, User
from backend.app.schemas.activities import (
    ActivityDetailResponse,
    ActivityListResponse,
    ActivityResponse,
)
from backend.app.services.fit_processor import process_fit_file
from backend.app.services.metrics_engine import recalculate_from

router = APIRouter(prefix="/activities", tags=["activities"])


async def _get_athlete(user: User, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")
    return athlete


async def _bg_process_and_recalculate(
    file_path: str, athlete_id: str, activity_id: str
) -> None:
    async with AsyncSessionLocal() as session:
        athlete_result = await session.execute(
            select(Athlete).where(Athlete.id == athlete_id)
        )
        athlete = athlete_result.scalar_one()

        activity_result = await session.execute(
            select(Activity).where(Activity.id == activity_id)
        )
        activity = activity_result.scalar_one()

        try:
            await process_fit_file(file_path, athlete, activity, session)
            start_date = (
                activity.start_time.date()
                if activity.start_time and hasattr(activity.start_time, "date")
                else date.today()
            )
            await recalculate_from(athlete_id, start_date, session)
        except Exception:
            activity.status = "error"
            await session.commit()
            raise


async def _bg_recalculate(athlete_id: str, from_date: date) -> None:
    async with AsyncSessionLocal() as session:
        await recalculate_from(athlete_id, from_date, session)


@router.post("/upload", response_model=ActivityResponse, status_code=201)
async def upload_activity(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    storage_dir = Path(settings.file_storage_path) / athlete.id
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / f"{uuid.uuid4()}.fit"
    file_path.write_bytes(await file.read())

    activity = Activity(
        id=str(uuid.uuid4()),
        athlete_id=athlete.id,
        source="upload",
        fit_file_path=str(file_path),
        status="pending",
    )
    session.add(activity)
    await session.commit()
    await session.refresh(activity)

    background_tasks.add_task(
        _bg_process_and_recalculate, str(file_path), athlete.id, activity.id
    )

    return ActivityResponse.model_validate(activity)


@router.get("/", response_model=ActivityListResponse)
async def list_activities(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    sport_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    base_query = select(Activity).where(Activity.athlete_id == athlete.id)
    if start:
        base_query = base_query.where(Activity.start_time >= datetime.combine(start, time.min))
    if end:
        base_query = base_query.where(Activity.start_time <= datetime.combine(end, time.max))
    if sport_type:
        base_query = base_query.where(Activity.sport_type == sport_type)

    count_result = await session.execute(
        select(func.count()).select_from(base_query.subquery())
    )
    total = count_result.scalar_one()

    items_result = await session.execute(
        base_query.order_by(Activity.start_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [ActivityResponse.model_validate(a) for a in items_result.scalars().all()]

    return ActivityListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{activity_id}", response_model=ActivityDetailResponse)
async def get_activity(
    activity_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    result = await session.execute(
        select(Activity).where(
            Activity.id == activity_id, Activity.athlete_id == athlete.id
        )
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    streams_result = await session.execute(
        select(ActivityStream).where(ActivityStream.activity_id == activity_id)
    )
    streams = {s.stream_type: s.data for s in streams_result.scalars()}

    return ActivityDetailResponse.from_orm_and_streams(activity, streams)


@router.delete("/{activity_id}", status_code=204)
async def delete_activity(
    activity_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    result = await session.execute(
        select(Activity).where(
            Activity.id == activity_id, Activity.athlete_id == athlete.id
        )
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    if activity.fit_file_path:
        p = Path(activity.fit_file_path)
        if p.exists():
            p.unlink()

    start_date = (
        activity.start_time.date()
        if activity.start_time and hasattr(activity.start_time, "date")
        else None
    )

    await session.delete(activity)
    await session.commit()

    if start_date:
        background_tasks.add_task(_bg_recalculate, athlete.id, start_date)
