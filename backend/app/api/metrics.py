from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.db.base import AsyncSessionLocal, get_session
from backend.app.models.orm import Activity, ActivityStream, Athlete, DailyMetric, User
from backend.app.schemas.metrics import FitnessCurrentResponse, FitnessMetricResponse
from openkoutsi.zones import Zones

router = APIRouter(prefix="/metrics", tags=["metrics"])


async def _get_athlete(user: User, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")
    return athlete


@router.get("/fitness", response_model=list[FitnessMetricResponse])
async def get_fitness(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    days: Optional[int] = Query(None, ge=1, le=3650),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    query = select(DailyMetric).where(DailyMetric.athlete_id == athlete.id)

    if days is not None and start is None:
        start = date.today() - timedelta(days=days)

    if start:
        query = query.where(DailyMetric.date >= start)
    if end:
        query = query.where(DailyMetric.date <= end)

    result = await session.execute(query.order_by(DailyMetric.date))
    return [FitnessMetricResponse.model_validate(m) for m in result.scalars().all()]


@router.get("/fitness/current", response_model=FitnessCurrentResponse)
async def get_fitness_current(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)
    today = date.today()

    result = await session.execute(
        select(DailyMetric).where(
            DailyMetric.athlete_id == athlete.id,
            DailyMetric.date == today,
        )
    )
    metric = result.scalar_one_or_none()
    if metric is None:
        return FitnessCurrentResponse(
            date=today, ctl=0.0, atl=0.0, tsb=0.0, tss_day=0.0
        )
    return FitnessCurrentResponse.model_validate(metric)


@router.get("/zones/{activity_id}")
async def get_zones(
    activity_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    activity_result = await session.execute(
        select(Activity).where(
            Activity.id == activity_id, Activity.athlete_id == athlete.id
        )
    )
    activity = activity_result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    if not athlete.hr_zones and not athlete.power_zones:
        raise HTTPException(status_code=400, detail="No zones configured on athlete")

    streams_result = await session.execute(
        select(ActivityStream).where(ActivityStream.activity_id == activity_id)
    )
    streams = {s.stream_type: s.data for s in streams_result.scalars()}

    result: dict = {}

    if athlete.hr_zones and streams.get("heartrate"):
        hr_zones = Zones(*[(z["low"], z["high"]) for z in athlete.hr_zones])
        time_in_hr: dict[str, int] = {}
        for v in streams["heartrate"]:
            zone_i = hr_zones.getZone(int(v))
            name = athlete.hr_zones[zone_i].get("name", f"Z{zone_i + 1}")
            time_in_hr[name] = time_in_hr.get(name, 0) + 1
        result["hr"] = time_in_hr

    if athlete.power_zones and streams.get("power"):
        pw_zones = Zones(*[(z["low"], z["high"]) for z in athlete.power_zones])
        time_in_pw: dict[str, int] = {}
        for v in streams["power"]:
            zone_i = pw_zones.getZone(int(v))
            name = athlete.power_zones[zone_i].get("name", f"Z{zone_i + 1}")
            time_in_pw[name] = time_in_pw.get(name, 0) + 1
        result["power"] = time_in_pw

    return result


@router.get("/ftp-history")
async def get_ftp_history(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)
    return athlete.ftp_tests or []


@router.post("/recalculate", status_code=202)
async def recalculate_all(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Recompute TSS for every processed activity using the athlete's current FTP/max_hr,
    then rebuild CTL/ATL/TSB from the earliest activity forward.

    Returns immediately (202); work happens in the background.
    """
    athlete = await _get_athlete(user, session)
    background_tasks.add_task(_bg_full_recalculate, athlete.id)
    return {"status": "recalculation started"}


async def _bg_full_recalculate(athlete_id: str) -> None:
    from backend.app.services.training_math import normalized_power, calculate_tss
    from backend.app.services.metrics_engine import recalculate_from

    async with AsyncSessionLocal() as session:
        athlete_result = await session.execute(
            select(Athlete).where(Athlete.id == athlete_id)
        )
        athlete = athlete_result.scalar_one()

        # Load all processed activities
        acts_result = await session.execute(
            select(Activity)
            .where(
                Activity.athlete_id == athlete_id,
                Activity.status == "processed",
            )
            .order_by(Activity.start_time)
        )
        activities = acts_result.scalars().all()

        if not activities:
            return

        earliest: date | None = None

        for activity in activities:
            # Re-derive NP from stored power stream (if any)
            stream_result = await session.execute(
                select(ActivityStream).where(
                    ActivityStream.activity_id == activity.id,
                    ActivityStream.stream_type == "power",
                )
            )
            power_stream = stream_result.scalar_one_or_none()
            power_data: list[float] = power_stream.data if power_stream else []

            np = (
                normalized_power(power_data)
                if len(power_data) >= 30
                else (activity.avg_power)  # fallback: use stored avg_power as proxy NP
            )

            tss, intensity_factor = calculate_tss(
                activity.duration_s or 0,
                np,
                activity.avg_hr,
                athlete.ftp,
                athlete.max_hr,
            )

            activity.tss = tss
            activity.intensity_factor = intensity_factor
            if np is not None:
                activity.normalized_power = np

            if activity.start_time is not None:
                day = (
                    activity.start_time.date()
                    if hasattr(activity.start_time, "date")
                    else activity.start_time
                )
                if earliest is None or day < earliest:
                    earliest = day

        await session.commit()

        if earliest is not None:
            await recalculate_from(athlete_id, earliest, session)
