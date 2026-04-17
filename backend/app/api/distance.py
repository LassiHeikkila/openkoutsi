from itertools import groupby

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.db.base import get_session
from backend.app.models.orm import Activity, ActivityDistanceBest, Athlete, User
from backend.app.schemas.distance import AllTimeDistanceBestsResponse, DistanceBestEntry
from backend.app.services.training_math import DISTANCE_BEST_DISTANCES

router = APIRouter(prefix="/distance", tags=["distance"])

TOP_N = 3


async def _get_athlete(user: User, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")
    return athlete


@router.get("/bests", response_model=AllTimeDistanceBestsResponse)
async def get_distance_bests(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Return the top-3 all-time best times for each standard distance,
    ordered by (distance_m asc, rank asc).  Distances with no data are omitted.
    """
    athlete = await _get_athlete(user, session)

    rows = await session.execute(
        select(ActivityDistanceBest, Activity.name)
        .join(Activity, Activity.id == ActivityDistanceBest.activity_id)
        .where(ActivityDistanceBest.athlete_id == athlete.id)
        .order_by(ActivityDistanceBest.distance_m, ActivityDistanceBest.time_s)
    )
    records = rows.all()

    entries: list[DistanceBestEntry] = []
    for _, group in groupby(records, key=lambda r: r[0].distance_m):
        for rank, (best, activity_name) in enumerate(group, start=1):
            if rank > TOP_N:
                break
            entries.append(
                DistanceBestEntry(
                    distance_m=best.distance_m,
                    rank=rank,
                    time_s=best.time_s,
                    activity_id=best.activity_id,
                    activity_name=activity_name,
                    activity_start_time=best.activity_start_time,
                )
            )

    distance_order = {d: i for i, d in enumerate(DISTANCE_BEST_DISTANCES)}
    entries.sort(key=lambda e: (distance_order.get(e.distance_m, 9999), e.rank))

    return AllTimeDistanceBestsResponse(bests=entries)
