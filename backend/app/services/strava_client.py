"""
Thin async HTTP wrapper around the Strava API.
All methods raise httpx.HTTPStatusError on non-2xx responses.
"""

import httpx

from backend.app.core.config import settings

_STRAVA_BASE = "https://www.strava.com"
_API_BASE = f"{_STRAVA_BASE}/api/v3"
_STREAM_KEYS = "time,heartrate,watts,cadence,velocity_smooth,altitude,distance"


class StravaClient:
    def __init__(self, access_token: str) -> None:
        self._headers = {"Authorization": f"Bearer {access_token}"}

    async def get_athlete(self) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{_API_BASE}/athlete", headers=self._headers)
            r.raise_for_status()
            return r.json()

    async def get_activities(
        self, page: int = 1, per_page: int = 200, after: int | None = None
    ) -> list[dict]:
        params: dict = {"page": page, "per_page": per_page}
        if after is not None:
            params["after"] = after
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{_API_BASE}/athlete/activities",
                headers=self._headers,
                params=params,
            )
            r.raise_for_status()
            return r.json()

    async def get_activity(self, activity_id: int) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{_API_BASE}/activities/{activity_id}", headers=self._headers
            )
            r.raise_for_status()
            return r.json()

    async def get_streams(self, activity_id: int) -> dict:
        """Returns a dict keyed by stream type, e.g. {"watts": {"data": [...], ...}}"""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{_API_BASE}/activities/{activity_id}/streams",
                headers=self._headers,
                params={"keys": _STREAM_KEYS, "key_by_type": "true"},
            )
            r.raise_for_status()
            return r.json()

    # ── Static auth helpers ────────────────────────────────────────────────

    @staticmethod
    async def exchange_code(code: str) -> dict:
        """Exchange an OAuth authorization code for access/refresh tokens."""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{_STRAVA_BASE}/oauth/token",
                json={
                    "client_id": settings.strava_client_id,
                    "client_secret": settings.strava_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                },
            )
            r.raise_for_status()
            return r.json()

    @staticmethod
    async def refresh_token_request(refresh_token: str) -> dict:
        """Obtain a new access token using a refresh token."""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{_STRAVA_BASE}/oauth/token",
                json={
                    "client_id": settings.strava_client_id,
                    "client_secret": settings.strava_client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            r.raise_for_status()
            return r.json()

    @staticmethod
    async def deauthorize(access_token: str) -> None:
        """Revoke an access token (best-effort; errors are swallowed by callers)."""
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{_STRAVA_BASE}/oauth/deauthorize",
                params={"access_token": access_token},
            )
