from datetime import date, datetime, timedelta, timezone
from itertools import groupby
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.db.base import get_session
from backend.app.models.orm import Activity, ActivityPowerBest, Athlete, User, WeightLog
from backend.app.schemas.power import AllTimePowerBestsResponse, PowerBestEntry
from backend.app.services.training_math import POWER_BEST_DURATIONS

router = APIRouter(prefix="/power", tags=["power"])

TOP_N = 3


async def _get_athlete(user: User, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")
    return athlete


@router.get("/bests", response_model=AllTimePowerBestsResponse)
async def get_power_bests(
    days: Optional[int] = Query(None, ge=1, description="Restrict to bests from the past N days. Omit for all-time."),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Return the top-3 best average power for each standard duration,
    ordered by (duration_s asc, rank asc).  Durations with no data are omitted.
    Pass ?days=90/180/365 to restrict to a rolling window; omit for all-time.
    """
    athlete = await _get_athlete(user, session)

    # Load weight log (sorted ascending by date for the lookup below)
    wl_rows = await session.execute(
        select(WeightLog)
        .where(WeightLog.athlete_id == athlete.id)
        .order_by(WeightLog.effective_date)
    )
    weight_log: list[tuple[date, float]] = [
        (w.effective_date, w.weight_kg) for w in wl_rows.scalars().all()
    ]

    def _effective_weight(activity_date: Optional[date]) -> Optional[float]:
        """Return the most recent weight whose effective_date <= activity_date."""
        if not activity_date or not weight_log:
            return None
        result: Optional[float] = None
        for eff_date, w_kg in weight_log:
            if eff_date <= activity_date:
                result = w_kg
            else:
                break
        return result

    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=days)
        if days is not None
        else None
    )

    where_clauses = [ActivityPowerBest.athlete_id == athlete.id]
    if cutoff is not None:
        where_clauses.append(ActivityPowerBest.activity_start_time >= cutoff)

    rows = await session.execute(
        select(ActivityPowerBest, Activity.name)
        .join(Activity, Activity.id == ActivityPowerBest.activity_id)
        .where(*where_clauses)
        .order_by(ActivityPowerBest.duration_s, ActivityPowerBest.power_w.desc())
    )
    records = rows.all()

    # Group by duration_s in the order they come from the query (already sorted)
    entries: list[PowerBestEntry] = []
    for _, group in groupby(records, key=lambda r: r[0].duration_s):
        for rank, (best, activity_name) in enumerate(group, start=1):
            if rank > TOP_N:
                break
            act_date = best.activity_start_time.date() if best.activity_start_time else None
            entries.append(
                PowerBestEntry(
                    duration_s=best.duration_s,
                    rank=rank,
                    power_w=round(best.power_w, 1),
                    activity_id=best.activity_id,
                    activity_name=activity_name,
                    activity_start_time=best.activity_start_time,
                    weight_kg=_effective_weight(act_date),
                )
            )

    # Preserve canonical duration order (POWER_BEST_DURATIONS) rather than
    # whatever order the DB happened to return.
    duration_order = {d: i for i, d in enumerate(POWER_BEST_DURATIONS)}
    entries.sort(key=lambda e: (duration_order.get(e.duration_s, 9999), e.rank))

    return AllTimePowerBestsResponse(bests=entries)
