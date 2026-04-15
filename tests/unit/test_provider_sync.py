"""
Unit tests for backend.app.services.provider_sync.

Tests ensure_fresh_token and sync_provider_activities in isolation by mocking
the PROVIDERS registry so no real HTTP calls are made.
"""
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select

from backend.app.models.orm import Activity, Athlete, ProviderConnection
from backend.app.services.provider_sync import ensure_fresh_token, sync_provider_activities
from backend.app.services.providers.base import NormalizedActivity


# ── Helpers ────────────────────────────────────────────────────────────────────


def _mock_conn(
    provider: str = "strava",
    *,
    access_token: str = "access-tok",
    refresh_token: str = "refresh-tok",
    token_expires_at: datetime | None = None,
) -> ProviderConnection:
    """Return a lightweight mock that satisfies ensure_fresh_token's attribute access."""
    conn = MagicMock(spec=ProviderConnection)
    conn.provider = provider
    conn.access_token = access_token
    conn.refresh_token = refresh_token
    conn.token_expires_at = token_expires_at
    return conn


def _norm(
    ext_id: str = "act-1",
    source: str = "strava",
    start_time: datetime | None = None,
) -> NormalizedActivity:
    return NormalizedActivity(
        external_id=ext_id,
        source=source,
        name="Test Ride",
        sport_type="Ride",
        start_time=start_time or datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc),
        duration_s=3600,
        distance_m=50_000.0,
        elevation_m=500.0,
        avg_power=None,
        avg_hr=None,
        max_hr=None,
        avg_speed_ms=14.0,
        avg_cadence=None,
    )


async def _make_athlete(session, user_id: str = "user-1") -> Athlete:
    athlete = Athlete(user_id=user_id)
    session.add(athlete)
    await session.commit()
    await session.refresh(athlete)
    return athlete


async def _make_connection(
    session,
    athlete: Athlete,
    provider: str = "strava",
    expires_in: timedelta = timedelta(hours=1),
) -> ProviderConnection:
    conn = ProviderConnection(
        athlete_id=athlete.id,
        provider=provider,
        access_token="access-tok",
        refresh_token="refresh-tok",
        token_expires_at=datetime.now(timezone.utc) + expires_in,
    )
    session.add(conn)
    await session.commit()
    await session.refresh(conn)
    return conn


# ── ensure_fresh_token ─────────────────────────────────────────────────────────


class TestEnsureFreshToken:
    async def test_valid_token_returned_unchanged(self, session):
        conn = _mock_conn(
            token_expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
        )
        token = await ensure_fresh_token(conn, session)
        assert token == "access-tok"

    async def test_no_expiry_returns_current_token(self, session):
        conn = _mock_conn(token_expires_at=None)
        token = await ensure_fresh_token(conn, session)
        assert token == "access-tok"

    async def test_expired_token_is_refreshed(self, session):
        conn = _mock_conn(
            token_expires_at=datetime.now(timezone.utc) - timedelta(hours=1)
        )
        mock_cls = MagicMock()
        mock_cls.refresh_access_token = AsyncMock(
            return_value={
                "access_token": "refreshed-token",
                "refresh_token": "new-refresh",
                "expires_at": 9999999999,
            }
        )

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            token = await ensure_fresh_token(conn, session)

        assert token == "refreshed-token"
        mock_cls.refresh_access_token.assert_called_once_with("refresh-tok")

    async def test_expired_token_updates_connection_attributes(self, session):
        conn = _mock_conn(
            token_expires_at=datetime.now(timezone.utc) - timedelta(hours=1)
        )
        mock_cls = MagicMock()
        mock_cls.refresh_access_token = AsyncMock(
            return_value={
                "access_token": "new-access",
                "refresh_token": "new-refresh",
                "expires_at": 9999999999,
            }
        )

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            await ensure_fresh_token(conn, session)

        assert conn.access_token == "new-access"
        assert conn.refresh_token == "new-refresh"

    async def test_unknown_provider_returns_current_token_without_error(self, session):
        conn = _mock_conn(
            provider="nonexistent",
            token_expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        with patch("backend.app.services.provider_sync.PROVIDERS", {}):
            token = await ensure_fresh_token(conn, session)
        assert token == "access-tok"


# ── sync_provider_activities ───────────────────────────────────────────────────


class TestSyncProviderActivities:
    async def test_imports_single_new_activity(self, session):
        athlete = await _make_athlete(session)
        conn = await _make_connection(session, athlete)

        mock_client = MagicMock()
        mock_client.list_activities = AsyncMock(side_effect=[[_norm()], []])
        mock_client.get_activity_streams = AsyncMock(return_value={})
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, earliest = await sync_provider_activities(athlete, conn, session)

        assert count == 1
        assert earliest == date(2024, 6, 1)

    async def test_skips_already_imported_external_id(self, session):
        athlete = await _make_athlete(session, user_id="user-2")
        conn = await _make_connection(session, athlete)

        # Pre-seed an activity with the same source + external_id
        session.add(
            Activity(
                athlete_id=athlete.id,
                source="strava",
                external_id="act-1",
                start_time=datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc),
                duration_s=3600,
                status="processed",
            )
        )
        await session.commit()

        mock_client = MagicMock()
        mock_client.list_activities = AsyncMock(side_effect=[[_norm()], []])
        mock_client.get_activity_streams = AsyncMock(return_value={})
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, earliest = await sync_provider_activities(athlete, conn, session)

        assert count == 0
        assert earliest is None

    async def test_cross_source_dedup_links_upload_to_provider(self, session):
        """An FIT-uploaded activity at the same time is linked, not duplicated."""
        athlete = await _make_athlete(session, user_id="user-3")
        conn = await _make_connection(session, athlete)

        base_time = datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc)
        upload_act = Activity(
            athlete_id=athlete.id,
            source="upload",
            external_id=None,
            start_time=base_time,
            duration_s=3600,
            status="processed",
        )
        session.add(upload_act)
        await session.commit()
        await session.refresh(upload_act)

        norm_act = _norm(ext_id="strava-99", start_time=base_time)
        mock_client = MagicMock()
        mock_client.list_activities = AsyncMock(side_effect=[[norm_act], []])
        mock_client.get_activity_streams = AsyncMock(return_value={})
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, earliest = await sync_provider_activities(athlete, conn, session)

        # Linked, not counted as a new import
        assert count == 0
        # The upload activity now carries the provider external_id
        await session.refresh(upload_act)
        assert upload_act.external_id == "strava-99"

    async def test_returns_correct_count_and_earliest_date(self, session):
        athlete = await _make_athlete(session, user_id="user-4")
        conn = await _make_connection(session, athlete)

        activities = [
            _norm(
                ext_id=f"act-{i}",
                start_time=datetime(2024, 6, i, 10, 0, tzinfo=timezone.utc),
            )
            for i in range(1, 4)  # June 1, 2, 3
        ]
        mock_client = MagicMock()
        mock_client.list_activities = AsyncMock(side_effect=[activities, []])
        mock_client.get_activity_streams = AsyncMock(return_value={})
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, earliest = await sync_provider_activities(athlete, conn, session)

        assert count == 3
        assert earliest == date(2024, 6, 1)

    async def test_stream_data_persisted_with_activity(self, session):
        from backend.app.models.orm import ActivityStream

        athlete = await _make_athlete(session, user_id="user-5")
        conn = await _make_connection(session, athlete)

        mock_client = MagicMock()
        mock_client.list_activities = AsyncMock(side_effect=[[_norm()], []])
        mock_client.get_activity_streams = AsyncMock(
            return_value={"power": [200, 210, 220], "heartrate": [140, 145, 150]}
        )
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, _ = await sync_provider_activities(athlete, conn, session)

        assert count == 1

        result = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id, Activity.source == "strava"
            )
        )
        act = result.scalar_one()
        stream_result = await session.execute(
            select(ActivityStream).where(ActivityStream.activity_id == act.id)
        )
        stream_types = {s.stream_type for s in stream_result.scalars()}
        assert "power" in stream_types
        assert "heartrate" in stream_types

    async def test_unknown_provider_returns_zero(self, session):
        athlete = await _make_athlete(session, user_id="user-6")
        conn = await _make_connection(session, athlete, provider="unknown")

        with patch("backend.app.services.provider_sync.PROVIDERS", {}):
            count, earliest = await sync_provider_activities(athlete, conn, session)

        assert count == 0
        assert earliest is None

    async def test_pagination_stops_on_empty_page(self, session):
        """list_activities is called until it returns an empty list."""
        athlete = await _make_athlete(session, user_id="user-7")
        conn = await _make_connection(session, athlete)

        mock_client = MagicMock()
        # Page 1 has 2 activities, page 2 has 1, page 3 is empty → stop
        mock_client.list_activities = AsyncMock(
            side_effect=[
                [_norm("a1"), _norm("a2")],
                [_norm("a3")],
                [],
            ]
        )
        mock_client.get_activity_streams = AsyncMock(return_value={})
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, _ = await sync_provider_activities(athlete, conn, session)

        assert count == 3
        assert mock_client.list_activities.call_count == 3
