"""
Unit tests for backend.app.services.wahoo_sync.process_wahoo_webhook.
"""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from backend.app.models.orm import Activity, ActivitySource, Athlete, ProviderConnection
from backend.app.services.wahoo_sync import process_wahoo_webhook

# Payload matching the real-world Wahoo webhook structure observed in production:
# workout is nested inside workout_summary, not at the top level.
WAHOO_PAYLOAD = {
    "event_type": "workout_summary",
    "webhook_token": "sdf098sd0f8s9d8f08sdf",
    "user": {
        "id": 9876543
    },
    "workout_summary": {
        "id": 12341234,
        "started_at": "2026-04-25T09:36:48.000Z",
        "ascent_accum": "103.0",
        "cadence_avg": "75.0",
        "calories_accum": "806.0",
        "distance_accum": "27441.58",
        "duration_active_accum": "4184.0",
        "duration_paused_accum": "337.0",
        "duration_total_accum": "4521.0",
        "heart_rate_avg": "160.0",
        "power_bike_np_last": "218.0",
        "power_bike_tss_last": "95.3",
        "power_avg": "191.0",
        "speed_avg": "6.56",
        "work_accum": "797068.0",
        "fitness_app_id": 1,
        "time_zone": "Europe/Helsinki",
        "created_at": "2026-04-25T10:52:37.000Z",
        "updated_at": "2026-04-25T10:52:38.000Z",
        "file": {
            "url": "https://example.com/fit_files/myworkout.fit"
        },
        "workout": {
            "id": 1234567890,
            "starts": "2026-04-25T09:36:48.000Z",
            "minutes": 75,
            "name": "Gravel cycling",
            "created_at": "2026-04-25T10:52:37.000Z",
            "updated_at": "2026-04-25T10:52:37.000Z",
            "plan_id": None,
            "workout_token": "ELEMNT BOLT AABB:CC",
            "workout_type_id": 0,
            "fitness_app_id": 1,
        },
    },
}


async def _seed_athlete_and_conn(session, wahoo_user_id: str = "9876543"):
    athlete = Athlete(user_id="test-user-1")
    session.add(athlete)
    await session.flush()

    conn = ProviderConnection(
        athlete_id=athlete.id,
        provider="wahoo",
        provider_athlete_id=wahoo_user_id,
        access_token="access-tok",
        refresh_token="refresh-tok",
    )
    session.add(conn)
    await session.flush()
    return athlete, conn


@pytest.mark.asyncio
async def test_process_wahoo_webhook_nested_workout_creates_activity(session):
    """
    Wahoo posts workout nested inside workout_summary (not at top level).
    process_wahoo_webhook must extract it, normalise it, and create an Activity.
    """
    await _seed_athlete_and_conn(session)

    with (
        patch(
            "backend.app.services.wahoo_sync.ensure_fresh_token",
            new=AsyncMock(return_value="access-tok"),
        ),
        patch(
            "backend.app.services.wahoo_sync._wahoo_client.download_fit_file",
            new=AsyncMock(side_effect=Exception("no FIT in test")),
        ),
        patch(
            "backend.app.services.wahoo_sync._populate_activity",
            new=AsyncMock(),
        ),
        patch(
            "backend.app.services.metrics_engine.recalculate_from",
            new=AsyncMock(),
        ),
    ):
        await process_wahoo_webhook(WAHOO_PAYLOAD, session)

    activities = (await session.execute(select(Activity))).scalars().all()
    assert len(activities) == 1, "Expected exactly one Activity to be created"

    act = activities[0]
    assert act.name == "Gravel cycling"
    assert act.sport_type == "Ride"  # workout_type_id=0 maps to Ride
    assert act.start_time == datetime(2026, 4, 25, 9, 36, 48, tzinfo=timezone.utc)
    assert act.distance_m == pytest.approx(27441.58)
    assert act.elevation_m == pytest.approx(103.0)
    assert act.avg_power == pytest.approx(191.0)
    assert act.avg_hr == pytest.approx(160.0)
    assert act.avg_cadence == pytest.approx(75.0)

    sources = (await session.execute(select(ActivitySource))).scalars().all()
    assert len(sources) == 1
    assert sources[0].provider == "wahoo"
    assert sources[0].external_id == "1234567890"


@pytest.mark.asyncio
async def test_process_wahoo_webhook_missing_user_ignored(session):
    """Payloads without user.id must be silently ignored."""
    payload = {**WAHOO_PAYLOAD, "user": {}}
    await process_wahoo_webhook(payload, session)

    activities = (await session.execute(select(Activity))).scalars().all()
    assert activities == []


@pytest.mark.asyncio
async def test_process_wahoo_webhook_missing_workout_ignored(session):
    """Payloads without any workout object (neither top-level nor nested) must be ignored."""
    summary_without_workout = {
        k: v for k, v in WAHOO_PAYLOAD["workout_summary"].items() if k != "workout"
    }
    payload = {**WAHOO_PAYLOAD, "workout_summary": summary_without_workout}
    payload.pop("workout", None)

    await process_wahoo_webhook(payload, session)

    activities = (await session.execute(select(Activity))).scalars().all()
    assert activities == []
