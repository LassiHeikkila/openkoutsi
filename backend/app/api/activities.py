import asyncio
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Optional

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.core.config import settings
from backend.app.core.deps import get_ctx_and_session
from backend.app.core.file_encryption import decrypt_file, encrypt_file
from backend.app.db.team_session import get_team_session_factory
from backend.app.models.team_orm import (
    Activity,
    ActivityDistanceBest,
    ActivityInterval,
    ActivityPowerBest,
    ActivitySource,
    ActivityStream,
    Athlete,
)
from backend.app.schemas.activities import (
    ActivityDetailResponse,
    ActivityListResponse,
    ActivityResponse,
    ActivityStreamsResponse,
    ActivityUpdate,
    FrontendAnalysisBody,
    IntervalResponse,
    ManualActivityCreate,
)
from backend.app.core.limiter import limiter
from backend.app.services.fit_processor import process_fit_file, read_fit_start_time
from backend.app.services.metrics_engine import recalculate_from
from backend.app.services.provider_sync import _source_priority
from backend.app.services.training_math import calculate_tss
from openkoutsi.categorization import WorkoutCategory, classify_workout

_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
_FIT_MAGIC = b".FIT"
_DUPLICATE_WINDOW = timedelta(minutes=5)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/activities", tags=["activities"])


async def _get_athlete(global_user_id: str, session: AsyncSession) -> Athlete:
    result = await session.execute(
        select(Athlete).where(Athlete.global_user_id == global_user_id)
    )
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")
    return athlete


def _maybe_auto_analyze(activity_id: str, athlete: Athlete, team_id: str) -> bool:
    app_settings = athlete.app_settings or {}
    if app_settings.get("auto_analyze") and app_settings.get("llm_base_url"):
        from backend.app.services.llm_activity_analyzer import analyze_activity_bg
        asyncio.create_task(analyze_activity_bg(activity_id, athlete.id, team_id))
        return True
    return False


async def _bg_process_and_recalculate(
    file_path: str, athlete_id: str, activity_id: str,
    team_id: str, global_user_id: str,
) -> None:
    async with get_team_session_factory(team_id)() as session:
        athlete_result = await session.execute(
            select(Athlete).where(Athlete.id == athlete_id)
        )
        athlete = athlete_result.scalar_one()

        activity_result = await session.execute(
            select(Activity).where(Activity.id == activity_id)
        )
        activity = activity_result.scalar_one()

        src_result = await session.execute(
            select(ActivitySource).where(
                ActivitySource.activity_id == activity_id,
                ActivitySource.provider == "upload",
            )
        )
        upload_src = src_result.scalar_one()

        try:
            await process_fit_file(file_path, athlete, activity, session)

            target_act = activity
            if activity.start_time is not None:
                existing_result = await session.execute(
                    select(Activity).where(
                        Activity.athlete_id == athlete_id,
                        Activity.id != activity_id,
                        Activity.start_time >= activity.start_time - _DUPLICATE_WINDOW,
                        Activity.start_time <= activity.start_time + _DUPLICATE_WINDOW,
                    )
                )
                existing_act = existing_result.scalar_one_or_none()

                if existing_act is not None:
                    for attr in (
                        "name", "sport_type", "start_time", "duration_s", "distance_m",
                        "elevation_m", "avg_power", "normalized_power", "avg_hr", "max_hr",
                        "avg_speed_ms", "avg_cadence", "tss", "intensity_factor",
                        "workout_category", "status",
                    ):
                        setattr(existing_act, attr, getattr(activity, attr))

                    await session.execute(
                        delete(ActivityStream).where(ActivityStream.activity_id == existing_act.id)
                    )
                    await session.execute(
                        delete(ActivityPowerBest).where(ActivityPowerBest.activity_id == existing_act.id)
                    )
                    await session.execute(
                        delete(ActivityDistanceBest).where(ActivityDistanceBest.activity_id == existing_act.id)
                    )
                    await session.flush()

                    await session.execute(
                        update(ActivityStream)
                        .where(ActivityStream.activity_id == activity_id)
                        .values(activity_id=existing_act.id)
                    )
                    await session.execute(
                        update(ActivityPowerBest)
                        .where(ActivityPowerBest.activity_id == activity_id)
                        .values(activity_id=existing_act.id)
                    )
                    await session.execute(
                        update(ActivityDistanceBest)
                        .where(ActivityDistanceBest.activity_id == activity_id)
                        .values(activity_id=existing_act.id)
                    )
                    await session.flush()

                    upload_src.activity_id = existing_act.id
                    await session.flush()

                    await session.execute(
                        delete(Activity).where(Activity.id == activity_id)
                    )
                    await session.flush()
                    target_act = existing_act

            start_date = (
                target_act.start_time.date()
                if target_act.start_time and hasattr(target_act.start_time, "date")
                else date.today()
            )

            try:
                encrypt_file(Path(file_path), team_id, global_user_id)
                upload_src.fit_file_encrypted = True
            except Exception:
                log.warning(
                    "Failed to encrypt FIT file %s — left in plaintext",
                    file_path,
                    exc_info=True,
                )

            if _maybe_auto_analyze(target_act.id, athlete, team_id):
                target_act.analysis_status = "pending"

            await session.commit()
            await recalculate_from(athlete_id, start_date, session)

        except Exception:
            try:
                err_result = await session.execute(
                    select(Activity).where(Activity.id == activity_id)
                )
                err_act = err_result.scalar_one_or_none()
                if err_act is not None:
                    err_act.status = "error"
                    await session.commit()
            except Exception:
                pass
            raise


async def _bg_recalculate(athlete_id: str, from_date: date, team_id: str) -> None:
    async with get_team_session_factory(team_id)() as session:
        await recalculate_from(athlete_id, from_date, session)


@router.post("/upload", response_model=ActivityResponse, status_code=201)
@limiter.limit("30/hour")
async def upload_activity(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    storage_dir = settings.team_fit_dir(ctx.team_id, ctx.user_id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / f"{uuid.uuid4()}.fit"

    written = 0
    with file_path.open("wb") as out:
        while True:
            chunk = await file.read(65536)
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

    with file_path.open("rb") as f:
        header = f.read(12)
    if len(header) < 12 or header[8:12] != _FIT_MAGIC:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="File is not a valid FIT file")

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
        status="pending",
    )
    session.add(activity)
    await session.flush()

    upload_src = ActivitySource(
        activity_id=activity.id,
        provider="upload",
        fit_file_path=str(file_path),
    )
    session.add(upload_src)
    await session.commit()
    await session.refresh(activity)

    background_tasks.add_task(
        _bg_process_and_recalculate,
        str(file_path), athlete.id, activity.id, ctx.team_id, ctx.user_id,
    )

    return ActivityResponse.model_validate(activity)


@router.post("/", response_model=ActivityResponse, status_code=201)
async def create_manual_activity(
    payload: ManualActivityCreate,
    background_tasks: BackgroundTasks,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

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
    await session.flush()

    manual_src = ActivitySource(activity_id=activity.id, provider="manual")
    session.add(manual_src)
    await session.commit()
    await session.refresh(activity)

    if tss is not None:
        start_date = (
            payload.start_time.date()
            if hasattr(payload.start_time, "date")
            else payload.start_time
        )
        background_tasks.add_task(_bg_recalculate, athlete.id, start_date, ctx.team_id)

    return ActivityResponse.model_validate(activity)


@router.get("/", response_model=ActivityListResponse)
async def list_activities(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    sport_type: Optional[str] = Query(None),
    wahoo_device_only: bool = Query(False, alias="wahoo_device_only"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    base_query = select(Activity).where(Activity.athlete_id == athlete.id)
    if start:
        base_query = base_query.where(Activity.start_time >= datetime.combine(start, time.min))
    if end:
        base_query = base_query.where(Activity.start_time <= datetime.combine(end, time.max))
    if sport_type:
        base_query = base_query.where(Activity.sport_type == sport_type)
    if wahoo_device_only:
        non_wahoo_exists = (
            select(ActivitySource.id)
            .where(
                ActivitySource.activity_id == Activity.id,
                ActivitySource.provider != "wahoo",
            )
            .exists()
        )
        base_query = base_query.where(
            or_(Activity.duration_s.isnot(None), non_wahoo_exists)
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
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    result = await session.execute(
        select(Activity).where(Activity.id == activity_id, Activity.athlete_id == athlete.id)
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

    ivs_result = await session.execute(
        select(ActivityInterval)
        .where(ActivityInterval.activity_id == activity_id)
        .order_by(ActivityInterval.interval_number)
    )
    intervals = [
        IntervalResponse.model_validate(iv, from_attributes=True)
        for iv in ivs_result.scalars()
    ]

    return ActivityDetailResponse.from_orm_and_streams(
        activity, streams, power_bests, distance_bests, intervals
    )


@router.get("/{activity_id}/streams", response_model=ActivityStreamsResponse)
async def get_activity_streams(
    activity_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    result = await session.execute(
        select(Activity).where(Activity.id == activity_id, Activity.athlete_id == athlete.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    streams_result = await session.execute(
        select(ActivityStream).where(ActivityStream.activity_id == activity_id)
    )
    streams = {s.stream_type: s.data for s in streams_result.scalars()}
    return ActivityStreamsResponse(streams=streams)


@router.get("/{activity_id}/fit")
async def download_fit_file(
    activity_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    result = await session.execute(
        select(Activity).where(Activity.id == activity_id, Activity.athlete_id == athlete.id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    fit_sources = [s for s in activity.sources if s.fit_file_path]
    if not fit_sources:
        raise HTTPException(status_code=404, detail="No FIT file for this activity")

    best = min(fit_sources, key=lambda s: _source_priority(s.provider, True))
    fit_path = Path(best.fit_file_path).resolve()
    expected_dir = settings.team_fit_dir(ctx.team_id, ctx.user_id).resolve()
    if not fit_path.is_relative_to(expected_dir):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not fit_path.exists():
        raise HTTPException(status_code=404, detail="FIT file not found on disk")

    safe_name = "".join(
        c if c.isalnum() or c in " _-" else "_"
        for c in (activity.name or activity.id)
    ).strip()
    filename = f"{safe_name}.fit"

    if best.fit_file_encrypted:
        content = decrypt_file(fit_path, ctx.team_id, ctx.user_id)
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


@router.post("/{activity_id}/reprocess-intervals", response_model=ActivityDetailResponse)
async def reprocess_intervals(
    activity_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    import io
    from sqlalchemy import delete as sa_delete
    from backend.app.services.fit_processor import (
        _auto_interval_s,
        _build_auto_intervals,
        _compute_interval_stats,
    )

    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    result = await session.execute(
        select(Activity).where(Activity.id == activity_id, Activity.athlete_id == athlete.id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.status != "processed":
        raise HTTPException(status_code=400, detail="Activity has not been processed yet")

    streams_result = await session.execute(
        select(ActivityStream).where(ActivityStream.activity_id == activity_id)
    )
    stream_map = {s.stream_type: s.data for s in streams_result.scalars()}

    fileish = None
    fit_sources = [s for s in (activity.sources or []) if s.fit_file_path]
    if fit_sources:
        best = min(fit_sources, key=lambda s: _source_priority(s.provider, True))
        fit_path = Path(best.fit_file_path).resolve()
        expected_dir = settings.team_fit_dir(ctx.team_id, ctx.user_id).resolve()
        if fit_path.is_relative_to(expected_dir) and fit_path.exists():
            if best.fit_file_encrypted:
                fileish = io.BytesIO(decrypt_file(fit_path, ctx.team_id, ctx.user_id))
            else:
                fileish = str(fit_path)

    from openkoutsi.fit import extractIntervals
    raw = extractIntervals(fileish) if fileish is not None else []
    is_auto = len(raw) <= 1

    if is_auto:
        duration_s = activity.duration_s or 0
        stream_length = max((len(v) for v in stream_map.values() if v), default=duration_s)
        actual_duration = max(duration_s, stream_length)
        interval_s = _auto_interval_s(actual_duration)
        start_time = activity.start_time
        if start_time and actual_duration:
            raw = _build_auto_intervals(start_time, actual_duration, interval_s)

    intervals_data: list[dict] = []
    if raw and activity.start_time:
        intervals_data = _compute_interval_stats(raw, activity.start_time, stream_map, is_auto)

    await session.execute(
        sa_delete(ActivityInterval).where(ActivityInterval.activity_id == activity_id)
    )
    for iv in intervals_data:
        session.add(ActivityInterval(id=str(uuid.uuid4()), activity_id=activity_id, **iv))
    await session.commit()

    bests_result = await session.execute(
        select(ActivityPowerBest).where(ActivityPowerBest.activity_id == activity_id)
    )
    power_bests = {b.duration_s: b.power_w for b in bests_result.scalars()}
    dbests_result = await session.execute(
        select(ActivityDistanceBest).where(ActivityDistanceBest.activity_id == activity_id)
    )
    distance_bests = {b.distance_m: b.time_s for b in dbests_result.scalars()}
    ivs_result = await session.execute(
        select(ActivityInterval)
        .where(ActivityInterval.activity_id == activity_id)
        .order_by(ActivityInterval.interval_number)
    )
    intervals = [
        IntervalResponse.model_validate(iv, from_attributes=True)
        for iv in ivs_result.scalars()
    ]
    return ActivityDetailResponse.from_orm_and_streams(
        activity, stream_map, power_bests, distance_bests, intervals
    )


@router.post("/{activity_id}/recalculate-category", response_model=ActivityResponse)
async def recalculate_category(
    activity_id: str,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    result = await session.execute(
        select(Activity).where(Activity.id == activity_id, Activity.athlete_id == athlete.id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    vi = (
        (activity.normalized_power / activity.avg_power)
        if (activity.normalized_power and activity.avg_power)
        else None
    )
    category = classify_workout(activity.intensity_factor, vi)
    activity.workout_category = category.value if category else None
    await session.commit()
    await session.refresh(activity)
    return ActivityResponse.model_validate(activity)


@router.patch("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: str,
    payload: ActivityUpdate,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    result = await session.execute(
        select(Activity).where(Activity.id == activity_id, Activity.athlete_id == athlete.id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    if payload.name is not None:
        activity.name = payload.name.strip()
    if "workout_category" in payload.model_fields_set:
        if payload.workout_category is None:
            activity.workout_category = None
        else:
            try:
                activity.workout_category = WorkoutCategory(payload.workout_category).value
            except ValueError:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unknown workout category: {payload.workout_category}",
                )

    await session.commit()
    await session.refresh(activity)
    return ActivityResponse.model_validate(activity)


@router.delete("/{activity_id}", status_code=204)
async def delete_activity(
    activity_id: str,
    background_tasks: BackgroundTasks,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)

    result = await session.execute(
        select(Activity).where(Activity.id == activity_id, Activity.athlete_id == athlete.id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    for src in activity.sources:
        if src.fit_file_path:
            p = Path(src.fit_file_path)
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
        background_tasks.add_task(_bg_recalculate, athlete.id, start_date, ctx.team_id)


@router.post("/{activity_id}/analyze", status_code=202)
async def trigger_analysis(
    activity_id: str,
    background_tasks: BackgroundTasks,
    ctx_session=Depends(get_ctx_and_session),
):
    from backend.app.services.llm_activity_analyzer import analyze_activity_bg

    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    result = await session.execute(
        select(Activity).where(Activity.id == activity_id, Activity.athlete_id == athlete.id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.analysis_status == "pending":
        return {"status": "pending"}

    activity.analysis_status = "pending"
    activity.analysis = None
    await session.commit()

    background_tasks.add_task(analyze_activity_bg, activity_id, athlete.id, ctx.team_id)
    return {"status": "pending"}


@router.patch("/{activity_id}/analysis", response_model=ActivityDetailResponse)
async def save_frontend_analysis(
    activity_id: str,
    body: FrontendAnalysisBody,
    ctx_session=Depends(get_ctx_and_session),
):
    ctx, session = ctx_session
    athlete = await _get_athlete(ctx.user_id, session)
    result = await session.execute(
        select(Activity).where(Activity.id == activity_id, Activity.athlete_id == athlete.id)
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
