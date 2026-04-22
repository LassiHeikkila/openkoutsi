import asyncio
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Optional

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.core.config import settings
from backend.app.core.file_encryption import decrypt_file, encrypt_file
from backend.app.db.base import get_session, AsyncSessionLocal
from backend.app.models.orm import Activity, ActivityDistanceBest, ActivityPowerBest, ActivityStream, Athlete, User
from backend.app.schemas.activities import (
    ActivityDetailResponse,
    ActivityListResponse,
    ActivityResponse,
    ActivityUpdate,
    FrontendAnalysisBody,
    ManualActivityCreate,
)
from backend.app.core.limiter import limiter
from backend.app.services.fit_processor import process_fit_file, read_fit_start_time
from backend.app.services.metrics_engine import recalculate_from
from backend.app.services.training_math import calculate_tss

_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
_FIT_MAGIC = b".FIT"  # FIT file header signature at bytes 8–11

_DUPLICATE_WINDOW = timedelta(minutes=5)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/activities", tags=["activities"])


async def _get_athlete(user: User, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")
    return athlete


def _maybe_auto_analyze(activity_id: str, athlete: Athlete) -> bool:
    """
    Schedule LLM analysis if auto_analyze is enabled in the athlete's app_settings.
    Returns True if a task was scheduled (caller should set analysis_status=pending).
    """
    app_settings = athlete.app_settings or {}
    if app_settings.get("auto_analyze") and settings.llm_base_url:
        from backend.app.services.llm_activity_analyzer import analyze_activity_bg
        asyncio.create_task(analyze_activity_bg(activity_id, athlete.id))
        return True
    return False


async def _dedup_after_fit_processing(
    activity: Activity,
    athlete_id: str,
    session: AsyncSession,
) -> None:
    """
    After a FIT file is processed and start_time is populated, check whether a
    provider already imported this workout while the upload was still pending.

    If a matching processed activity is found within the duplicate window,
    mark this upload as a duplicate and suppress its TSS so fitness metrics
    are not double-counted.
    """
    if activity.start_time is None:
        return
    result = await session.execute(
        select(Activity).where(
            Activity.athlete_id == athlete_id,
            Activity.id != activity.id,
            Activity.duplicate_of_id.is_(None),
            Activity.start_time >= activity.start_time - _DUPLICATE_WINDOW,
            Activity.start_time <= activity.start_time + _DUPLICATE_WINDOW,
            Activity.status == "processed",
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        activity.duplicate_of_id = existing.id


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
            # Suppress TSS if a provider already imported this workout while the
            # FIT upload was still pending, to avoid double-counting in CTL/ATL.
            await _dedup_after_fit_processing(activity, athlete_id, session)
            start_date = (
                activity.start_time.date()
                if activity.start_time and hasattr(activity.start_time, "date")
                else date.today()
            )
            await recalculate_from(athlete_id, start_date, session)

            # Encrypt the FIT file now that analysis is complete.
            try:
                encrypt_file(Path(file_path), athlete.user_id)
                activity.fit_file_encrypted = True
            except Exception:
                log.warning(
                    "Failed to encrypt FIT file %s for user %s — file left in plaintext",
                    file_path,
                    athlete.user_id,
                    exc_info=True,
                )

            # asyncio.create_task schedules the coroutine but won't run it until
            # the next await, so setting analysis_status and committing first
            # ensures the task sees the correct state in the DB.
            if _maybe_auto_analyze(activity_id, athlete):
                activity.analysis_status = "pending"
            await session.commit()
        except Exception:
            activity.status = "error"
            await session.commit()
            raise


async def _bg_recalculate(athlete_id: str, from_date: date) -> None:
    async with AsyncSessionLocal() as session:
        await recalculate_from(athlete_id, from_date, session)


@router.post("/upload", response_model=ActivityResponse, status_code=201)
@limiter.limit("30/hour")
async def upload_activity(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    storage_dir = Path(settings.file_storage_path) / athlete.id
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / f"{uuid.uuid4()}.fit"

    # Stream the file to disk while enforcing the size limit
    written = 0
    with file_path.open("wb") as out:
        while True:
            chunk = await file.read(65536)  # 64 KB chunks
            if not chunk:
                break
            written += len(chunk)
            if written > _MAX_UPLOAD_BYTES:
                file_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit",
                )
            out.write(chunk)

    # Validate FIT file magic bytes (bytes 8–11 must be ".FIT")
    with file_path.open("rb") as f:
        header = f.read(12)
    if len(header) < 12 or header[8:12] != _FIT_MAGIC:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="File is not a valid FIT file")

    # Duplicate detection: extract the activity's start timestamp and check
    # whether the athlete already has an activity within a 30-second window.
    # This catches both re-uploads of the same FIT file and FIT files that
    # correspond to an activity already imported from Strava.
    fit_start = read_fit_start_time(str(file_path))
    if fit_start is not None:
        dupe_result = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.start_time >= fit_start - _DUPLICATE_WINDOW,
                Activity.start_time <= fit_start + _DUPLICATE_WINDOW,
            )
        )
        duplicate = dupe_result.scalar_one_or_none()
        if duplicate is not None:
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=409,
                detail="An activity starting at this time already exists.",
            )

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


@router.post("/", response_model=ActivityResponse, status_code=201)
async def create_manual_activity(
    payload: ManualActivityCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    # Resolve TSS: explicit value > RPE estimate > HR-based calculation
    tss: Optional[float] = None
    if payload.tss is not None:
        tss = payload.tss
    elif payload.rpe is not None:
        tss = (payload.duration_s / 3600) * (payload.rpe ** 2) * 10
    elif payload.avg_hr is not None:
        tss, _ = calculate_tss(
            payload.duration_s, None, payload.avg_hr, None, athlete.max_hr
        )

    activity = Activity(
        id=str(uuid.uuid4()),
        athlete_id=athlete.id,
        source="manual",
        name=payload.name or f"{payload.sport_type} Activity",
        sport_type=payload.sport_type,
        start_time=payload.start_time,
        duration_s=payload.duration_s,
        avg_hr=payload.avg_hr,
        distance_m=payload.distance_m,
        elevation_m=payload.elevation_m,
        tss=tss,
        status="processed",
    )
    session.add(activity)
    await session.commit()
    await session.refresh(activity)

    if tss is not None:
        start_date = (
            payload.start_time.date()
            if hasattr(payload.start_time, "date")
            else payload.start_time
        )
        background_tasks.add_task(_bg_recalculate, athlete.id, start_date)

    return ActivityResponse.model_validate(activity)


@router.get("/", response_model=ActivityListResponse)
async def list_activities(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    sport_type: Optional[str] = Query(None),
    wahoo_device_only: bool = Query(False, alias="wahoo_device_only"),
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
    if wahoo_device_only:
        # Hide Wahoo activities that have no device data (synced from a third-party app
        # via Wahoo — no workout_summary, so duration_s is never populated).
        base_query = base_query.where(
            or_(Activity.source != "wahoo", Activity.duration_s.isnot(None))
        )

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

    bests_result = await session.execute(
        select(ActivityPowerBest).where(ActivityPowerBest.activity_id == activity_id)
    )
    power_bests = {b.duration_s: b.power_w for b in bests_result.scalars()}

    dbests_result = await session.execute(
        select(ActivityDistanceBest).where(ActivityDistanceBest.activity_id == activity_id)
    )
    distance_bests = {b.distance_m: b.time_s for b in dbests_result.scalars()}

    return ActivityDetailResponse.from_orm_and_streams(activity, streams, power_bests, distance_bests)


@router.get("/{activity_id}/fit")
async def download_fit_file(
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

    if not activity.fit_file_path:
        raise HTTPException(status_code=404, detail="No FIT file for this activity")

    fit_path = Path(activity.fit_file_path).resolve()
    expected_dir = Path(settings.file_storage_path).resolve()
    if not fit_path.is_relative_to(expected_dir):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not fit_path.exists():
        raise HTTPException(status_code=404, detail="FIT file not found on disk")

    safe_name = "".join(
        c if c.isalnum() or c in " _-" else "_"
        for c in (activity.name or activity.id)
    ).strip()
    filename = f"{safe_name}.fit"

    if activity.fit_file_encrypted:
        content = decrypt_file(fit_path, athlete.user_id)
        return Response(
            content=content,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    return FileResponse(
        path=str(fit_path),
        media_type="application/octet-stream",
        filename=filename,
    )


@router.patch("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: str,
    payload: ActivityUpdate,
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

    activity.name = payload.name.strip()
    await session.commit()
    await session.refresh(activity)
    return ActivityResponse.model_validate(activity)


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


@router.post("/{activity_id}/analyze", status_code=202)
async def trigger_analysis(
    activity_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Manually trigger LLM analysis for an activity. Idempotent: re-running replaces any prior result."""
    from backend.app.services.llm_activity_analyzer import analyze_activity_bg

    athlete = await _get_athlete(user, session)
    result = await session.execute(
        select(Activity).where(
            Activity.id == activity_id, Activity.athlete_id == athlete.id
        )
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.analysis_status == "pending":
        return {"status": "pending"}

    activity.analysis_status = "pending"
    activity.analysis = None
    await session.commit()

    background_tasks.add_task(analyze_activity_bg, activity_id, athlete.id)
    return {"status": "pending"}


@router.patch("/{activity_id}/analysis", response_model=ActivityDetailResponse)
async def save_frontend_analysis(
    activity_id: str,
    body: FrontendAnalysisBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Save a frontend-generated LLM analysis result for an activity."""
    athlete = await _get_athlete(user, session)
    result = await session.execute(
        select(Activity).where(
            Activity.id == activity_id, Activity.athlete_id == athlete.id
        )
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    activity.analysis = body.analysis
    activity.analysis_status = "done"
    await session.commit()

    streams_result = await session.execute(
        select(ActivityStream).where(ActivityStream.activity_id == activity_id)
    )
    streams = {s.stream_type: s.data for s in streams_result.scalars()}
    return ActivityDetailResponse.from_orm_and_streams(activity, streams)
