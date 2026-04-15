"""
Integration tests for /api/integrations endpoints.

Tests the full OAuth lifecycle (status, connect, callback, sync, disconnect)
via the HTTP test client wired to an in-memory SQLite database.
"""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from jose import jwt
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.models.orm import Activity, Athlete, ProviderConnection


# ── Test helpers ───────────────────────────────────────────────────────────────


async def _get_athlete(session, client, auth_headers) -> Athlete:
    data = (await client.get("/api/athlete/", headers=auth_headers)).json()
    result = await session.execute(select(Athlete).where(Athlete.id == data["id"]))
    return result.scalar_one()


async def _add_connection(session, athlete: Athlete, provider: str) -> ProviderConnection:
    conn = ProviderConnection(
        athlete_id=athlete.id,
        provider=provider,
        access_token="test-access-token",
        refresh_token="test-refresh-token",
        token_expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
    )
    session.add(conn)
    await session.commit()
    return conn


async def _add_activity(
    session, athlete: Athlete, source: str, external_id: str
) -> Activity:
    act = Activity(
        athlete_id=athlete.id,
        source=source,
        external_id=external_id,
        start_time=datetime(2024, 1, 15, tzinfo=timezone.utc),
        duration_s=3600,
        status="processed",
    )
    session.add(act)
    await session.commit()
    return act


def _encode_state(user_id: str, provider: str) -> str:
    return jwt.encode(
        {"sub": user_id, "purpose": f"{provider}_oauth"},
        settings.secret_key,
        algorithm="HS256",
    )


# ── /status ────────────────────────────────────────────────────────────────────


class TestStatus:
    async def test_empty_when_no_connections(self, client, auth_headers):
        resp = await client.get("/api/integrations/status", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"connected": []}

    async def test_lists_connected_providers(self, client, session, auth_headers):
        athlete = await _get_athlete(session, client, auth_headers)
        await _add_connection(session, athlete, "strava")

        resp = await client.get("/api/integrations/status", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"connected": ["strava"]}

    async def test_lists_multiple_providers(self, client, session, auth_headers):
        athlete = await _get_athlete(session, client, auth_headers)
        await _add_connection(session, athlete, "strava")
        await _add_connection(session, athlete, "wahoo")

        resp = await client.get("/api/integrations/status", headers=auth_headers)
        assert resp.status_code == 200
        assert set(resp.json()["connected"]) == {"strava", "wahoo"}

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/integrations/status")
        assert resp.status_code == 401


# ── /{provider}/connect ────────────────────────────────────────────────────────


class TestConnect:
    async def test_unknown_provider_returns_404(self, client, auth_headers):
        resp = await client.get("/api/integrations/unknown/connect", headers=auth_headers)
        assert resp.status_code == 404

    async def test_unconfigured_strava_returns_501(self, client, auth_headers):
        # In the test environment strava_client_id defaults to "" → 501
        resp = await client.get("/api/integrations/strava/connect", headers=auth_headers)
        assert resp.status_code == 501

    async def test_configured_strava_returns_oauth_url(self, client, auth_headers):
        from backend.app.services.providers.strava import StravaProviderClient

        with (
            patch.object(settings, "strava_client_id", "test-client-id"),
            patch.object(
                StravaProviderClient,
                "get_oauth_url",
                return_value="https://strava.com/oauth/authorize?state=x",
            ),
        ):
            resp = await client.get(
                "/api/integrations/strava/connect", headers=auth_headers
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "url" in data
        assert "strava.com" in data["url"]

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/integrations/strava/connect")
        assert resp.status_code == 401


# ── /{provider}/callback ───────────────────────────────────────────────────────


class TestCallback:
    async def test_invalid_state_redirects_to_error(self, client):
        resp = await client.get(
            "/api/integrations/strava/callback?code=testcode&state=not-a-jwt",
            follow_redirects=False,
        )
        assert resp.status_code in (302, 307)
        assert "strava=error" in resp.headers["location"]

    async def test_valid_state_creates_connection_and_redirects(
        self, client, session, auth_headers
    ):
        athlete = await _get_athlete(session, client, auth_headers)
        state = _encode_state(athlete.user_id, "strava")

        from backend.app.services.providers.strava import StravaProviderClient

        with patch.object(
            StravaProviderClient,
            "exchange_code",
            new_callable=AsyncMock,
            return_value={
                "access_token": "new-access-token",
                "refresh_token": "new-refresh-token",
                "expires_at": 9999999999,
                "provider_athlete_id": "strava-athlete-42",
            },
        ):
            resp = await client.get(
                f"/api/integrations/strava/callback?code=authcode&state={state}",
                follow_redirects=False,
            )

        assert resp.status_code in (302, 307)
        assert "strava=connected" in resp.headers["location"]

        # The ProviderConnection row must be persisted
        result = await session.execute(
            select(ProviderConnection).where(
                ProviderConnection.athlete_id == athlete.id,
                ProviderConnection.provider == "strava",
            )
        )
        conn = result.scalar_one_or_none()
        assert conn is not None
        assert conn.provider_athlete_id == "strava-athlete-42"

    async def test_callback_idempotent_for_existing_connection(
        self, client, session, auth_headers
    ):
        """A second OAuth callback updates the existing connection instead of creating a duplicate."""
        athlete = await _get_athlete(session, client, auth_headers)
        await _add_connection(session, athlete, "strava")
        state = _encode_state(athlete.user_id, "strava")

        from backend.app.services.providers.strava import StravaProviderClient

        with patch.object(
            StravaProviderClient,
            "exchange_code",
            new_callable=AsyncMock,
            return_value={
                "access_token": "updated-token",
                "refresh_token": "updated-refresh",
                "expires_at": 9999999999,
                "provider_athlete_id": "strava-42",
            },
        ):
            resp = await client.get(
                f"/api/integrations/strava/callback?code=code2&state={state}",
                follow_redirects=False,
            )

        assert resp.status_code in (302, 307)

        result = await session.execute(
            select(ProviderConnection).where(
                ProviderConnection.athlete_id == athlete.id,
                ProviderConnection.provider == "strava",
            )
        )
        connections = result.scalars().all()
        assert len(connections) == 1  # no duplicates


# ── /{provider}/sync ───────────────────────────────────────────────────────────


class TestSync:
    async def test_unknown_provider_returns_404(self, client, auth_headers):
        resp = await client.post(
            "/api/integrations/unknown/sync", headers=auth_headers
        )
        assert resp.status_code == 404

    async def test_not_connected_returns_400(self, client, auth_headers):
        resp = await client.post(
            "/api/integrations/strava/sync", headers=auth_headers
        )
        assert resp.status_code == 400

    async def test_connected_accepts_sync_request(self, client, session, auth_headers):
        athlete = await _get_athlete(session, client, auth_headers)
        await _add_connection(session, athlete, "strava")

        resp = await client.post(
            "/api/integrations/strava/sync", headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "sync started"

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.post("/api/integrations/strava/sync")
        assert resp.status_code == 401


# ── /{provider}/disconnect ─────────────────────────────────────────────────────


class TestDisconnect:
    async def test_unauthenticated_returns_401(self, client):
        resp = await client.delete("/api/integrations/strava/disconnect")
        assert resp.status_code == 401

    async def test_not_connected_returns_400(self, client, auth_headers):
        resp = await client.delete(
            "/api/integrations/strava/disconnect", headers=auth_headers
        )
        assert resp.status_code == 400

    async def test_disconnects_removes_connection(self, client, session, auth_headers):
        athlete = await _get_athlete(session, client, auth_headers)
        await _add_connection(session, athlete, "strava")

        from backend.app.services.providers.strava import StravaProviderClient

        with patch.object(
            StravaProviderClient, "revoke_token", new_callable=AsyncMock
        ):
            resp = await client.delete(
                "/api/integrations/strava/disconnect", headers=auth_headers
            )

        assert resp.status_code == 204

        result = await session.execute(
            select(ProviderConnection).where(
                ProviderConnection.athlete_id == athlete.id,
                ProviderConnection.provider == "strava",
            )
        )
        assert result.scalar_one_or_none() is None

    async def test_keeps_activities_when_delete_data_not_set(
        self, client, session, auth_headers
    ):
        athlete = await _get_athlete(session, client, auth_headers)
        await _add_connection(session, athlete, "strava")
        act = await _add_activity(session, athlete, "strava", "strava-act-1")
        act_id = act.id  # capture before request — bulk DELETE expunges ORM object

        from backend.app.services.providers.strava import StravaProviderClient

        with patch.object(
            StravaProviderClient, "revoke_token", new_callable=AsyncMock
        ):
            resp = await client.delete(
                "/api/integrations/strava/disconnect", headers=auth_headers
            )

        assert resp.status_code == 204

        result = await session.execute(select(Activity).where(Activity.id == act_id))
        assert result.scalar_one_or_none() is not None

    async def test_deletes_provider_activities_when_requested(
        self, client, session, auth_headers
    ):
        athlete = await _get_athlete(session, client, auth_headers)
        await _add_connection(session, athlete, "strava")
        act = await _add_activity(session, athlete, "strava", "strava-act-2")
        act_id = act.id  # capture before request

        from backend.app.services.providers.strava import StravaProviderClient

        with patch.object(
            StravaProviderClient, "revoke_token", new_callable=AsyncMock
        ):
            resp = await client.delete(
                "/api/integrations/strava/disconnect?delete_data=true",
                headers=auth_headers,
            )

        assert resp.status_code == 204

        result = await session.execute(select(Activity).where(Activity.id == act_id))
        assert result.scalar_one_or_none() is None

    async def test_preserves_activities_from_other_providers(
        self, client, session, auth_headers
    ):
        athlete = await _get_athlete(session, client, auth_headers)
        await _add_connection(session, athlete, "strava")
        strava_act = await _add_activity(session, athlete, "strava", "strava-123")
        wahoo_act = await _add_activity(session, athlete, "wahoo", "wahoo-456")
        strava_id = strava_act.id  # capture before request
        wahoo_id = wahoo_act.id

        from backend.app.services.providers.strava import StravaProviderClient

        with patch.object(
            StravaProviderClient, "revoke_token", new_callable=AsyncMock
        ):
            resp = await client.delete(
                "/api/integrations/strava/disconnect?delete_data=true",
                headers=auth_headers,
            )

        assert resp.status_code == 204

        strava_result = await session.execute(
            select(Activity).where(Activity.id == strava_id)
        )
        wahoo_result = await session.execute(
            select(Activity).where(Activity.id == wahoo_id)
        )
        assert strava_result.scalar_one_or_none() is None
        assert wahoo_result.scalar_one_or_none() is not None
