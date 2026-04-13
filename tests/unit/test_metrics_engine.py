"""
Unit tests for backend/app/services/metrics_engine.py.

Uses the async session fixture from conftest.py to run against an in-memory DB.
"""
import math
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from backend.app.models.orm import Activity, Athlete, DailyMetric, User
from backend.app.services.metrics_engine import recalculate_from

# EMA decay constants (same as production)
K42 = 1 - math.exp(-1 / 42)
K7 = 1 - math.exp(-1 / 7)

TODAY = date.today()


async def _make_athlete(session) -> Athlete:
    """Create a minimal User + Athlete in the test DB and return the Athlete."""
    user = User(
        id=str(uuid.uuid4()),
        email=f"u{uuid.uuid4().hex[:6]}@test.com",
        password_hash="x",
    )
    session.add(user)
    await session.flush()

    athlete = Athlete(id=str(uuid.uuid4()), user_id=user.id, ftp_tests=[])
    session.add(athlete)
    await session.flush()
    return athlete


async def _make_activity(session, athlete_id: str, tss: float, day: date) -> Activity:
    """Insert a processed Activity with the given TSS on the given date."""
    activity = Activity(
        id=str(uuid.uuid4()),
        athlete_id=athlete_id,
        source="manual",
        tss=tss,
        status="processed",
        start_time=datetime.combine(day, datetime.min.time()).replace(tzinfo=timezone.utc),
    )
    session.add(activity)
    await session.flush()
    return activity


class TestRecalculateFrom:
    async def test_single_activity_ctl_atl(self, session):
        athlete = await _make_athlete(session)
        await _make_activity(session, athlete.id, tss=100.0, day=TODAY)

        await recalculate_from(athlete.id, TODAY, session)

        result = await session.execute(
            select(DailyMetric).where(
                DailyMetric.athlete_id == athlete.id,
                DailyMetric.date == TODAY,
            )
        )
        metric = result.scalar_one()

        assert metric.ctl == pytest.approx(100 * K42, rel=1e-6)
        assert metric.atl == pytest.approx(100 * K7, rel=1e-6)
        # TSB is computed from yesterday's CTL - ATL (both zero for first day)
        assert metric.tsb == pytest.approx(0.0, abs=1e-9)
        assert metric.tss_day == pytest.approx(100.0, rel=1e-6)

    async def test_two_activities_same_day_tss_summed(self, session):
        athlete = await _make_athlete(session)
        await _make_activity(session, athlete.id, tss=60.0, day=TODAY)
        await _make_activity(session, athlete.id, tss=40.0, day=TODAY)

        await recalculate_from(athlete.id, TODAY, session)

        result = await session.execute(
            select(DailyMetric).where(
                DailyMetric.athlete_id == athlete.id,
                DailyMetric.date == TODAY,
            )
        )
        metric = result.scalar_one()

        # Both activities' TSS should be summed before the EMA step
        assert metric.tss_day == pytest.approx(100.0, rel=1e-6)
        assert metric.ctl == pytest.approx(100 * K42, rel=1e-6)

    async def test_second_day_inherits_previous_ctl_atl(self, session):
        athlete = await _make_athlete(session)
        yesterday = TODAY - timedelta(days=1)
        await _make_activity(session, athlete.id, tss=100.0, day=yesterday)

        await recalculate_from(athlete.id, yesterday, session)

        # Day 1 (yesterday)
        r1 = await session.execute(
            select(DailyMetric).where(
                DailyMetric.athlete_id == athlete.id,
                DailyMetric.date == yesterday,
            )
        )
        m1 = r1.scalar_one()
        assert m1.ctl == pytest.approx(100 * K42, rel=1e-6)
        assert m1.atl == pytest.approx(100 * K7, rel=1e-6)

        # Day 2 (today) — no activity, so tss_day=0
        r2 = await session.execute(
            select(DailyMetric).where(
                DailyMetric.athlete_id == athlete.id,
                DailyMetric.date == TODAY,
            )
        )
        m2 = r2.scalar_one()
        expected_ctl2 = m1.ctl + (0.0 - m1.ctl) * K42
        expected_atl2 = m1.atl + (0.0 - m1.atl) * K7
        assert m2.ctl == pytest.approx(expected_ctl2, rel=1e-6)
        assert m2.atl == pytest.approx(expected_atl2, rel=1e-6)
        # TSB on day 2 = day 1's CTL - day 1's ATL
        assert m2.tsb == pytest.approx(m1.ctl - m1.atl, rel=1e-6)

    async def test_empty_athlete_produces_no_metrics(self, session):
        athlete = await _make_athlete(session)
        # No activities — recalculate from today still runs (creates metrics with 0 tss)
        await recalculate_from(athlete.id, TODAY, session)

        result = await session.execute(
            select(DailyMetric).where(DailyMetric.athlete_id == athlete.id)
        )
        metrics = result.scalars().all()
        # One row for today with zeroed-out values
        assert len(metrics) == 1
        assert metrics[0].tss_day == pytest.approx(0.0)
        assert metrics[0].ctl == pytest.approx(0.0)
