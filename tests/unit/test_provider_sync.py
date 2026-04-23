"""
Unit tests for backend.app.services.provider_sync.

Tests ensure_fresh_token and sync_provider_activities in isolation by mocking
the PROVIDERS registry so no real HTTP calls are made.
"""
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select

from backend.app.models.orm import Activity, ActivitySource, Athlete, ProviderConnection
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
    async def test_imports_new_activity_creates_source(self, session):
        """A new activity creates exactly one Activity + one ActivitySource."""
        athlete = await _make_athlete(session)
        conn = await _make_connection(session, athlete)

        mock_client = MagicMock()
        mock_client.list_activities = AsyncMock(side_effect=[[_norm()], []])
        mock_client.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        mock_client.get_activity_streams = AsyncMock(return_value={})
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, earliest = await sync_provider_activities(athlete, conn, session)

        assert count == 1
        assert earliest == date(2024, 6, 1)

        # Verify Activity + ActivitySource were created
        acts = (await session.execute(select(Activity).where(Activity.athlete_id == athlete.id))).scalars().all()
        assert len(acts) == 1
        srcs = (await session.execute(select(ActivitySource).where(ActivitySource.activity_id == acts[0].id))).scalars().all()
        assert len(srcs) == 1
        assert srcs[0].provider == "strava"
        assert srcs[0].external_id == "act-1"

    async def test_skips_already_imported_source(self, session):
        """If (provider, external_id) already has an ActivitySource, skip it."""
        athlete = await _make_athlete(session, user_id="user-2")
        conn = await _make_connection(session, athlete)

        # Pre-seed Activity + ActivitySource
        act = Activity(
            athlete_id=athlete.id,
            start_time=datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc),
            duration_s=3600,
            status="processed",
        )
        session.add(act)
        await session.flush()
        session.add(ActivitySource(activity_id=act.id, provider="strava", external_id="act-1"))
        await session.commit()

        mock_client = MagicMock()
        mock_client.list_activities = AsyncMock(side_effect=[[_norm()], []])
        mock_client.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        mock_client.get_activity_streams = AsyncMock(return_value={})
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, earliest = await sync_provider_activities(athlete, conn, session)

        assert count == 0
        assert earliest is None

    async def test_same_workout_second_provider_adds_source_to_existing_activity(self, session):
        """When a second provider syncs the same workout, it adds an ActivitySource
        to the existing Activity instead of creating a new one."""
        athlete = await _make_athlete(session, user_id="user-3")
        strava_conn = await _make_connection(session, athlete, provider="strava")
        wahoo_conn = await _make_connection(session, athlete, provider="wahoo")

        base_time = datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc)

        # Sync Strava first
        strava_mock = MagicMock()
        strava_mock.list_activities = AsyncMock(side_effect=[[_norm("strava-1", "strava", base_time)], []])
        strava_mock.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        strava_mock.get_activity_streams = AsyncMock(return_value={})
        strava_cls = MagicMock(return_value=strava_mock)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": strava_cls}):
            await sync_provider_activities(athlete, strava_conn, session)

        # Sync Wahoo — same start_time, should attach to existing Activity
        wahoo_mock = MagicMock()
        wahoo_mock.list_activities = AsyncMock(side_effect=[[_norm("wahoo-1", "wahoo", base_time)], []])
        wahoo_mock.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        wahoo_mock.get_activity_streams = AsyncMock(return_value={})
        wahoo_cls = MagicMock(return_value=wahoo_mock)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"wahoo": wahoo_cls}):
            await sync_provider_activities(athlete, wahoo_conn, session)

        # Exactly ONE Activity, TWO ActivitySources
        acts = (await session.execute(select(Activity).where(Activity.athlete_id == athlete.id))).scalars().all()
        assert len(acts) == 1

        srcs = (await session.execute(select(ActivitySource).where(ActivitySource.activity_id == acts[0].id))).scalars().all()
        providers = {s.provider for s in srcs}
        assert providers == {"strava", "wahoo"}

    async def test_wahoo_with_fit_repopulates_when_strava_is_existing_winner(self, session):
        """Wahoo with a FIT file (priority=2) beats an existing Strava source (priority=3)
        and repopulates the Activity metrics."""
        athlete = await _make_athlete(session, user_id="user-4")
        athlete.ftp = 250
        await session.commit()

        strava_conn = await _make_connection(session, athlete, provider="strava")
        wahoo_conn = await _make_connection(session, athlete, provider="wahoo")

        base_time = datetime(2024, 7, 1, 8, 0, tzinfo=timezone.utc)

        # Strava syncs first with power stream data
        strava_mock = MagicMock()
        strava_mock.list_activities = AsyncMock(side_effect=[[_norm("strava-1", "strava", base_time)], []])
        strava_mock.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        strava_mock.get_activity_streams = AsyncMock(return_value={"power": [150] * 120})
        strava_cls = MagicMock(return_value=strava_mock)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": strava_cls}):
            await sync_provider_activities(athlete, strava_conn, session)

        # Capture Strava-derived TSS
        acts = (await session.execute(select(Activity).where(Activity.athlete_id == athlete.id))).scalars().all()
        assert len(acts) == 1
        strava_tss = acts[0].tss

        # Wahoo syncs with a FIT file — should repopulate (priority 2 beats priority 3)
        fit_bytes = b"fakeFITdata"
        wahoo_mock = MagicMock()
        wahoo_mock.list_activities = AsyncMock(side_effect=[[_norm("wahoo-1", "wahoo", base_time)], []])
        # Return fake FIT bytes so we know FIT was "downloaded"
        wahoo_mock.download_fit_file = AsyncMock(return_value=fit_bytes)
        wahoo_cls = MagicMock(return_value=wahoo_mock)

        from unittest.mock import patch as _patch
        import fitdecode

        fake_profile = MagicMock()
        fake_profile.power = [200] * 120
        fake_profile.heartRate = []
        fake_profile.cadence = []
        fake_profile.speed = []
        fake_profile.altitude = []
        fake_profile.avgHeartRate = None
        fake_profile.peakHR = None
        fake_profile.avgPower = 200.0
        fake_profile.avgCadence = 0
        fake_profile.avgSpeed = 0
        fake_profile.duration = 3600
        fake_profile.distance = 50000
        fake_profile.elevationGain = 500
        fake_profile.start_time = base_time
        fake_profile.sport_type = "cycling"

        with (
            patch("backend.app.services.provider_sync.PROVIDERS", {"wahoo": wahoo_cls}),
            patch("backend.app.services.provider_sync.fitdecode.FitReader"),
            patch("backend.app.services.provider_sync.summarizeWorkout", return_value=fake_profile),
            patch("backend.app.services.provider_sync.encrypt_file"),
        ):
            wahoo_count, _ = await sync_provider_activities(athlete, wahoo_conn, session)

        assert wahoo_count == 1

        await session.refresh(acts[0])
        # Activity should now have Wahoo FIT data (higher power → higher TSS)
        assert acts[0].tss is not None
        # Two sources on the single Activity
        srcs = (await session.execute(select(ActivitySource).where(ActivitySource.activity_id == acts[0].id))).scalars().all()
        assert {s.provider for s in srcs} == {"strava", "wahoo"}

    async def test_lower_priority_source_does_not_repopulate(self, session):
        """Strava (priority=3) does not repopulate when Wahoo+FIT (priority=2) is existing winner."""
        athlete = await _make_athlete(session, user_id="user-5")
        athlete.ftp = 250
        await session.commit()

        wahoo_conn = await _make_connection(session, athlete, provider="wahoo")
        strava_conn = await _make_connection(session, athlete, provider="strava")

        base_time = datetime(2024, 7, 2, 8, 0, tzinfo=timezone.utc)

        # Wahoo syncs first with a FIT file (priority=2)
        fit_bytes = b"fakeFIT"
        wahoo_mock = MagicMock()
        wahoo_mock.list_activities = AsyncMock(side_effect=[[_norm("wahoo-1", "wahoo", base_time)], []])
        wahoo_mock.download_fit_file = AsyncMock(return_value=fit_bytes)
        wahoo_cls = MagicMock(return_value=wahoo_mock)

        fake_profile = MagicMock()
        fake_profile.power = [220] * 3600
        fake_profile.heartRate = []
        fake_profile.cadence = []
        fake_profile.speed = []
        fake_profile.altitude = []
        fake_profile.avgHeartRate = None
        fake_profile.peakHR = None
        fake_profile.avgPower = 220.0
        fake_profile.avgCadence = 0
        fake_profile.avgSpeed = 0
        fake_profile.duration = 3600
        fake_profile.distance = 50000
        fake_profile.elevationGain = 500
        fake_profile.start_time = base_time
        fake_profile.sport_type = "cycling"

        with (
            patch("backend.app.services.provider_sync.PROVIDERS", {"wahoo": wahoo_cls}),
            patch("backend.app.services.provider_sync.fitdecode.FitReader"),
            patch("backend.app.services.provider_sync.summarizeWorkout", return_value=fake_profile),
            patch("backend.app.services.provider_sync.encrypt_file"),
        ):
            await sync_provider_activities(athlete, wahoo_conn, session)

        acts = (await session.execute(select(Activity).where(Activity.athlete_id == athlete.id))).scalars().all()
        assert len(acts) == 1
        wahoo_tss = acts[0].tss

        # Strava syncs with different stream data — should NOT repopulate (priority 3 > 2)
        strava_mock = MagicMock()
        strava_mock.list_activities = AsyncMock(side_effect=[[_norm("strava-1", "strava", base_time)], []])
        strava_mock.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        strava_mock.get_activity_streams = AsyncMock(return_value={"power": [100] * 120})
        strava_cls = MagicMock(return_value=strava_mock)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": strava_cls}):
            strava_count, _ = await sync_provider_activities(athlete, strava_conn, session)

        assert strava_count == 0  # Strava source added but not counted as a new/updated activity

        await session.refresh(acts[0])
        # Metrics should be unchanged from Wahoo's data
        assert acts[0].tss == wahoo_tss

        srcs = (await session.execute(select(ActivitySource).where(ActivitySource.activity_id == acts[0].id))).scalars().all()
        assert {s.provider for s in srcs} == {"wahoo", "strava"}

    async def test_blank_wahoo_strava_with_data_becomes_winner(self, session):
        """Wahoo without FIT (priority=4) is already existing; Strava (priority=3) wins
        and repopulates the Activity metrics."""
        athlete = await _make_athlete(session, user_id="user-6")
        athlete.ftp = 250
        await session.commit()

        wahoo_conn = await _make_connection(session, athlete, provider="wahoo")
        strava_conn = await _make_connection(session, athlete, provider="strava")

        base_time = datetime(2024, 7, 5, 8, 0, tzinfo=timezone.utc)

        # Wahoo syncs first — no FIT, no streams → blank (priority=4)
        wahoo_mock = MagicMock()
        wahoo_mock.list_activities = AsyncMock(side_effect=[[_norm("wahoo-blank", "wahoo", base_time)], []])
        wahoo_mock.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        wahoo_mock.get_activity_streams = AsyncMock(return_value={})
        wahoo_cls = MagicMock(return_value=wahoo_mock)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"wahoo": wahoo_cls}):
            await sync_provider_activities(athlete, wahoo_conn, session)

        acts = (await session.execute(select(Activity).where(Activity.athlete_id == athlete.id))).scalars().all()
        assert len(acts) == 1
        assert acts[0].tss is None  # blank Wahoo has no TSS

        # Strava syncs with power data → priority=3 beats blank Wahoo priority=4 → repopulates
        strava_mock = MagicMock()
        strava_mock.list_activities = AsyncMock(side_effect=[[_norm("strava-real", "strava", base_time)], []])
        strava_mock.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        strava_mock.get_activity_streams = AsyncMock(return_value={"power": [200] * 120})
        strava_cls = MagicMock(return_value=strava_mock)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": strava_cls}):
            strava_count, _ = await sync_provider_activities(athlete, strava_conn, session)

        assert strava_count == 1  # repopulated

        await session.refresh(acts[0])
        # Activity should now have Strava's data
        assert acts[0].tss is not None

        srcs = (await session.execute(select(ActivitySource).where(ActivitySource.activity_id == acts[0].id))).scalars().all()
        assert {s.provider for s in srcs} == {"wahoo", "strava"}

    async def test_returns_correct_count_and_earliest_date(self, session):
        athlete = await _make_athlete(session, user_id="user-7")
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
        mock_client.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        mock_client.get_activity_streams = AsyncMock(return_value={})
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, earliest = await sync_provider_activities(athlete, conn, session)

        assert count == 3
        assert earliest == date(2024, 6, 1)

    async def test_stream_data_persisted_with_activity(self, session):
        from backend.app.models.orm import ActivityStream

        athlete = await _make_athlete(session, user_id="user-8")
        conn = await _make_connection(session, athlete)

        mock_client = MagicMock()
        mock_client.list_activities = AsyncMock(side_effect=[[_norm()], []])
        mock_client.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        mock_client.get_activity_streams = AsyncMock(
            return_value={"power": [200, 210, 220], "heartrate": [140, 145, 150]}
        )
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, _ = await sync_provider_activities(athlete, conn, session)

        assert count == 1

        act = (await session.execute(
            select(Activity).where(Activity.athlete_id == athlete.id)
        )).scalar_one()
        stream_result = await session.execute(
            select(ActivityStream).where(ActivityStream.activity_id == act.id)
        )
        stream_types = {s.stream_type for s in stream_result.scalars()}
        assert "power" in stream_types
        assert "heartrate" in stream_types

    async def test_unknown_provider_returns_zero(self, session):
        athlete = await _make_athlete(session, user_id="user-9")
        conn = await _make_connection(session, athlete, provider="unknown")

        with patch("backend.app.services.provider_sync.PROVIDERS", {}):
            count, earliest = await sync_provider_activities(athlete, conn, session)

        assert count == 0
        assert earliest is None

    async def test_pagination_stops_on_empty_page(self, session):
        """list_activities is called until it returns an empty list."""
        athlete = await _make_athlete(session, user_id="user-10")
        conn = await _make_connection(session, athlete)

        # Each activity has a distinct start_time so they aren't merged
        t1 = datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc)
        t2 = datetime(2024, 6, 2, 10, 0, tzinfo=timezone.utc)
        t3 = datetime(2024, 6, 3, 10, 0, tzinfo=timezone.utc)

        mock_client = MagicMock()
        mock_client.list_activities = AsyncMock(
            side_effect=[
                [_norm("a1", start_time=t1), _norm("a2", start_time=t2)],
                [_norm("a3", start_time=t3)],
                [],
            ]
        )
        mock_client.download_fit_file = AsyncMock(side_effect=Exception("no FIT"))
        mock_client.get_activity_streams = AsyncMock(return_value={})
        mock_cls = MagicMock(return_value=mock_client)

        with patch("backend.app.services.provider_sync.PROVIDERS", {"strava": mock_cls}):
            count, _ = await sync_provider_activities(athlete, conn, session)

        assert count == 3
        assert mock_client.list_activities.call_count == 3
