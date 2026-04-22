import math
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.orm import Activity, DailyMetric


async def recalculate_from(
    athlete_id: str, from_date: date, session: AsyncSession
) -> None:
    # Load seed CTL/ATL from the day before from_date (or 0.0)
    prev_date = from_date - timedelta(days=1)
    prev_result = await session.execute(
        select(DailyMetric).where(
            DailyMetric.athlete_id == athlete_id,
            DailyMetric.date == prev_date,
        )
    )
    prev = prev_result.scalar_one_or_none()
    ctl = prev.ctl if prev else 0.0
    atl = prev.atl if prev else 0.0

    # Load all processed activities from from_date onwards, bucket TSS by date
    cutoff = datetime.combine(from_date, time.min)
    acts_result = await session.execute(
        select(Activity).where(
            Activity.athlete_id == athlete_id,
            Activity.start_time >= cutoff,
            Activity.tss.is_not(None),
            Activity.duplicate_of_id.is_(None),
            Activity.status == "processed",
        )
    )
    tss_by_date: dict[date, float] = {}
    for act in acts_result.scalars():
        if act.start_time is None:
            continue
        day = (
            act.start_time.date()
            if hasattr(act.start_time, "date")
            else act.start_time
        )
        tss_by_date[day] = tss_by_date.get(day, 0.0) + (act.tss or 0.0)

    k42 = 1 - math.exp(-1 / 42)
    k7 = 1 - math.exp(-1 / 7)

    current = from_date
    today = date.today()
    while current <= today:
        tss_day = tss_by_date.get(current, 0.0)
        tsb = ctl - atl  # form = yesterday's CTL - yesterday's ATL
        new_ctl = ctl + (tss_day - ctl) * k42
        new_atl = atl + (tss_day - atl) * k7

        existing = await session.execute(
            select(DailyMetric).where(
                DailyMetric.athlete_id == athlete_id,
                DailyMetric.date == current,
            )
        )
        metric = existing.scalar_one_or_none()
        if metric is None:
            metric = DailyMetric(athlete_id=athlete_id, date=current)
            session.add(metric)

        metric.ctl = new_ctl
        metric.atl = new_atl
        metric.tsb = tsb
        metric.tss_day = tss_day

        ctl = new_ctl
        atl = new_atl
        current += timedelta(days=1)

    await session.commit()
