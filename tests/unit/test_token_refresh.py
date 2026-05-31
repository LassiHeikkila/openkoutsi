"""
Unit tests for backend.app.services.token_refresh.

Tests cover _refresh_expiring_tokens (the core query-and-refresh logic) and
the token_refresh_loop error-isolation behaviour. No real HTTP calls are made;
the provider refresh_access_token is always mocked.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app.db.base import RegistryBase
from backend.app.models.registry_orm import ProviderConnection, User
from backend.app.services.token_refresh import _refresh_expiring_tokens, token_refresh_loop


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture
async def reg_engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(RegistryBase.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def reg_session_factory(reg_engine):
    return async_sessionmaker(reg_engine, expire_on_commit=False)


@pytest.fixture
async def seeded_user(reg_session_factory):
    async with reg_session_factory() as s:
        user = User(id="user-1", username="tester", password_hash="x")
        s.add(user)
        await s.commit()
    return "user-1"


def _make_conn(
    user_id: str,
    provider: str = "strava",
    *,
    expires_in: timedelta,
    refresh_token: str | None = "refresh-tok",
) -> ProviderConnection:
    return ProviderConnection(
        user_id=user_id,
        provider=provider,
        access_token="old-access",
        refresh_token=refresh_token,
        token_expires_at=datetime.now(timezone.utc) + expires_in,
    )


def _mock_provider(new_access: str = "new-access") -> MagicMock:
    cls = MagicMock()
    cls.refresh_access_token = AsyncMock(
        return_value={
            "access_token": new_access,
            "refresh_token": "new-refresh",
            "expires_at": int((datetime.now(timezone.utc) + timedelta(hours=6)).timestamp()),
        }
    )
    return cls


# ── _refresh_expiring_tokens ───────────────────────────────────────────────────


class TestRefreshExpiringTokens:
    async def test_refreshes_token_expiring_soon(self, reg_session_factory, seeded_user):
        async with reg_session_factory() as s:
            conn = _make_conn(seeded_user, "strava", expires_in=timedelta(minutes=30))
            s.add(conn)
            await s.commit()
            conn_id = conn.id

        mock_provider = _mock_provider("refreshed-access")
        with (
            patch(
                "backend.app.services.token_refresh._RegistrySessionLocal",
                reg_session_factory,
            ),
            patch(
                "backend.app.services.provider_sync.PROVIDERS",
                {"strava": mock_provider},
            ),
        ):
            await _refresh_expiring_tokens()

        async with reg_session_factory() as s:
            updated = await s.get(ProviderConnection, conn_id)
        assert updated.access_token == "refreshed-access"
        mock_provider.refresh_access_token.assert_called_once()

    async def test_skips_token_not_expiring_soon(self, reg_session_factory, seeded_user):
        async with reg_session_factory() as s:
            conn = _make_conn(seeded_user, "strava", expires_in=timedelta(hours=3))
            s.add(conn)
            await s.commit()
            conn_id = conn.id

        mock_provider = _mock_provider()
        with (
            patch(
                "backend.app.services.token_refresh._RegistrySessionLocal",
                reg_session_factory,
            ),
            patch(
                "backend.app.services.provider_sync.PROVIDERS",
                {"strava": mock_provider},
            ),
        ):
            await _refresh_expiring_tokens()

        mock_provider.refresh_access_token.assert_not_called()
        async with reg_session_factory() as s:
            unchanged = await s.get(ProviderConnection, conn_id)
        assert unchanged.access_token == "old-access"

    async def test_skips_connection_without_refresh_token(
        self, reg_session_factory, seeded_user
    ):
        async with reg_session_factory() as s:
            conn = _make_conn(
                seeded_user, "strava", expires_in=timedelta(minutes=10), refresh_token=None
            )
            s.add(conn)
            await s.commit()

        mock_provider = _mock_provider()
        with (
            patch(
                "backend.app.services.token_refresh._RegistrySessionLocal",
                reg_session_factory,
            ),
            patch(
                "backend.app.services.provider_sync.PROVIDERS",
                {"strava": mock_provider},
            ),
        ):
            await _refresh_expiring_tokens()

        mock_provider.refresh_access_token.assert_not_called()

    async def test_refreshes_already_expired_token(self, reg_session_factory, seeded_user):
        async with reg_session_factory() as s:
            conn = _make_conn(seeded_user, "strava", expires_in=timedelta(hours=-1))
            s.add(conn)
            await s.commit()
            conn_id = conn.id

        mock_provider = _mock_provider("refreshed-expired")
        with (
            patch(
                "backend.app.services.token_refresh._RegistrySessionLocal",
                reg_session_factory,
            ),
            patch(
                "backend.app.services.provider_sync.PROVIDERS",
                {"strava": mock_provider},
            ),
        ):
            await _refresh_expiring_tokens()

        async with reg_session_factory() as s:
            updated = await s.get(ProviderConnection, conn_id)
        assert updated.access_token == "refreshed-expired"

    async def test_refreshes_wahoo_token(self, reg_session_factory, seeded_user):
        async with reg_session_factory() as s:
            conn = _make_conn(seeded_user, "wahoo", expires_in=timedelta(minutes=45))
            s.add(conn)
            await s.commit()
            conn_id = conn.id

        mock_provider = _mock_provider("wahoo-refreshed")
        with (
            patch(
                "backend.app.services.token_refresh._RegistrySessionLocal",
                reg_session_factory,
            ),
            patch(
                "backend.app.services.provider_sync.PROVIDERS",
                {"wahoo": mock_provider},
            ),
        ):
            await _refresh_expiring_tokens()

        async with reg_session_factory() as s:
            updated = await s.get(ProviderConnection, conn_id)
        assert updated.access_token == "wahoo-refreshed"

    async def test_one_failure_does_not_prevent_other_refreshes(
        self, reg_session_factory, seeded_user
    ):
        async with reg_session_factory() as s:
            conn_a = _make_conn(seeded_user, "strava", expires_in=timedelta(minutes=10))
            s.add(conn_a)
            await s.flush()
            conn_a_id = conn_a.id

            # Second user needed for unique (user_id, provider) constraint
            user2 = User(id="user-2", username="tester2", password_hash="x")
            s.add(user2)
            await s.flush()
            conn_b = _make_conn("user-2", "strava", expires_in=timedelta(minutes=10))
            s.add(conn_b)
            await s.commit()
            conn_b_id = conn_b.id

        call_count = 0

        async def _flaky_refresh(refresh_token: str):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("provider API error")
            return {
                "access_token": "second-ok",
                "refresh_token": "new-refresh",
                "expires_at": int(
                    (datetime.now(timezone.utc) + timedelta(hours=6)).timestamp()
                ),
            }

        mock_provider = MagicMock()
        mock_provider.refresh_access_token = _flaky_refresh

        with (
            patch(
                "backend.app.services.token_refresh._RegistrySessionLocal",
                reg_session_factory,
            ),
            patch(
                "backend.app.services.provider_sync.PROVIDERS",
                {"strava": mock_provider},
            ),
        ):
            await _refresh_expiring_tokens()

        async with reg_session_factory() as s:
            a = await s.get(ProviderConnection, conn_a_id)
            b = await s.get(ProviderConnection, conn_b_id)

        assert a.access_token == "old-access"  # first call failed
        assert b.access_token == "second-ok"   # second call succeeded


# ── token_refresh_loop ─────────────────────────────────────────────────────────


class TestTokenRefreshLoop:
    async def test_loop_calls_refresh_and_handles_exceptions(self):
        call_count = 0

        async def _failing_refresh():
            nonlocal call_count
            call_count += 1
            raise RuntimeError("boom")

        with patch(
            "backend.app.services.token_refresh._refresh_expiring_tokens",
            side_effect=_failing_refresh,
        ):
            task = asyncio.create_task(token_refresh_loop())
            # Advance past the initial sleep by mocking asyncio.sleep
            # Run the loop for two iterations via controlled sleep patches
            with patch("backend.app.services.token_refresh.asyncio.sleep", AsyncMock()):
                await asyncio.sleep(0)  # yield to the event loop
                await asyncio.sleep(0)
                await asyncio.sleep(0)

            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Loop must have attempted the refresh despite the exception
        assert call_count >= 1
