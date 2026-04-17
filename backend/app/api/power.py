from itertools import groupby

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.db.base import get_session
from backend.app.models.orm import Activity, ActivityPowerBest, Athlete, User
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
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Return the top-3 all-time best average power for each standard duration,
    ordered by (duration_s asc, rank asc).  Durations with no data are omitted.
    """
    athlete = await _get_athlete(user, session)

    rows = await session.execute(
        select(ActivityPowerBest, Activity.name)
        .join(Activity, Activity.id == ActivityPowerBest.activity_id)
        .where(ActivityPowerBest.athlete_id == athlete.id)
        .order_by(ActivityPowerBest.duration_s, ActivityPowerBest.power_w.desc())
    )
    records = rows.all()

    # Group by duration_s in the order they come from the query (already sorted)
    entries: list[PowerBestEntry] = []
    for _, group in groupby(records, key=lambda r: r[0].duration_s):
        for rank, (best, activity_name) in enumerate(group, start=1):
            if rank > TOP_N:
                break
            entries.append(
                PowerBestEntry(
                    duration_s=best.duration_s,
                    rank=rank,
                    power_w=round(best.power_w, 1),
                    activity_id=best.activity_id,
                    activity_name=activity_name,
                    activity_start_time=best.activity_start_time,
                )
            )

    # Preserve canonical duration order (POWER_BEST_DURATIONS) rather than
    # whatever order the DB happened to return.
    duration_order = {d: i for i, d in enumerate(POWER_BEST_DURATIONS)}
    entries.sort(key=lambda e: (duration_order.get(e.duration_s, 9999), e.rank))

    return AllTimePowerBestsResponse(bests=entries)
