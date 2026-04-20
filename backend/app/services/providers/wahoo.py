"""
Wahoo Cloud API provider implementation.

Uses Wahoo's OAuth 2.0 authorization code flow. Activity summaries come from
the /v1/workouts endpoint; time-series streams are obtained by downloading the
FIT file for each workout and parsing it with fitdecode.
"""

import io
import urllib.parse
from datetime import datetime, timezone

import fitdecode
import httpx

from backend.app.core.config import settings
from backend.app.services.providers.base import BaseProviderClient, NormalizedActivity

_BASE = "https://api.wahooligan.com"
_AUTH_URL = f"{_BASE}/oauth/authorize"
_TOKEN_URL = f"{_BASE}/oauth/token"
_API_BASE = f"{_BASE}/v1"

_SCOPES = "user_read workouts_read offline_data"
_PAGE_SIZE = 30
_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=5.0)

# Wahoo workout_type_id → sport_type string (subset; extend as needed)
_SPORT_TYPES: dict[int, str] = {
    0: "Cycling",
    1: "Running",
    2: "Strength",
    3: "Yoga",
    4: "Other",
    5: "Rowing",
    6: "Skiing",
    7: "Hiking",
    8: "Swimming",
    9: "Walking",
    10: "MTBRide",
    11: "VirtualRide",
    12: "EBikeRide",
    13: "NordicSki",
    14: "Kayaking",
    15: "Surfing",
    16: "Crossfit",
    17: "WeightTraining",
    18: "Elliptical",
    19: "StairStepper",
    20: "Skating",
}


class WahooClient(BaseProviderClient):
    PROVIDER_NAME = "wahoo"

    # ── OAuth ──────────────────────────────────────────────────────────────

    def get_oauth_url(self, state: str, redirect_uri: str) -> str:
        params = {
            "client_id": settings.wahoo_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": _SCOPES,
            "state": state,
        }
        return f"{_AUTH_URL}?{urllib.parse.urlencode(params)}"

    @staticmethod
    async def exchange_code(code: str, redirect_uri: str) -> dict:  # type: ignore[override]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                _TOKEN_URL,
                data={
                    "client_id": settings.wahoo_client_id,
                    "client_secret": settings.wahoo_client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            r.raise_for_status()
            data = r.json()

        # Fetch user profile to get the Wahoo user ID
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            u = await client.get(
                f"{_API_BASE}/user",
                headers={"Authorization": f"Bearer {data['access_token']}"},
            )
            u.raise_for_status()
            user = u.json()

        expires_at = int(datetime.now(timezone.utc).timestamp()) + int(
            data.get("expires_in", 3600)
        )
        return {
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "expires_at": expires_at,
            "provider_athlete_id": str(user.get("id", "")),
        }

    @staticmethod
    async def refresh_access_token(refresh_token: str) -> dict:  # type: ignore[override]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                _TOKEN_URL,
                data={
                    "client_id": settings.wahoo_client_id,
                    "client_secret": settings.wahoo_client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            r.raise_for_status()
            data = r.json()

        expires_at = int(datetime.now(timezone.utc).timestamp()) + int(
            data.get("expires_in", 3600)
        )
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", refresh_token),
            "expires_at": expires_at,
            "provider_athlete_id": "",
        }

    @staticmethod
    async def revoke_token(access_token: str) -> None:  # type: ignore[override]
        # Wahoo doesn't expose a public token revocation endpoint; nothing to do.
        pass

    # ── Data ───────────────────────────────────────────────────────────────

    async def list_activities(
        self, access_token: str, page: int
    ) -> list[NormalizedActivity]:
        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(
                f"{_API_BASE}/workouts",
                headers=headers,
                params={
                    "page": page,
                    "per_page": _PAGE_SIZE,
                    "order_by": "starts",
                    "order_dir": "desc",
                },
            )
            r.raise_for_status()
            data = r.json()

        workouts: list[dict] = data.get("workouts", [])
        return [_normalize_workout(w) for w in workouts]

    async def get_activity_streams(
        self, access_token: str, external_id: str
    ) -> dict[str, list[float]]:
        """Download the FIT file for this workout and extract streams."""
        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            r = await client.get(
                f"{_API_BASE}/workouts/{external_id}/fit_file",
                headers=headers,
            )
            r.raise_for_status()
            fit_bytes = r.content

        return _parse_fit_streams(fit_bytes)


# ── Helpers ────────────────────────────────────────────────────────────────

def _normalize_workout(raw: dict) -> NormalizedActivity:
    summary: dict = raw.get("workout_summary") or {}
    sport_id: int = raw.get("workout_type_id", 0)
    sport_type = _SPORT_TYPES.get(sport_id, f"Workout_{sport_id}")

    starts: str | None = raw.get("starts")
    if starts:
        start_time = datetime.fromisoformat(starts.replace("Z", "+00:00"))
    else:
        start_time = datetime.now(timezone.utc)

    # Prefer active (moving) time; fall back to total duration.
    duration_s = _int_or_none(summary.get("duration_seconds_active")) or \
                 _int_or_none(summary.get("duration_seconds_total"))

    return NormalizedActivity(
        external_id=str(raw["id"]),
        source="wahoo",
        name=raw.get("name") or f"{sport_type} {start_time.strftime('%Y-%m-%d')}",
        sport_type=sport_type,
        start_time=start_time,
        duration_s=duration_s,
        distance_m=_float_or_none(summary.get("distance_accum")),
        elevation_m=_float_or_none(summary.get("ascent_accum")),
        avg_power=_float_or_none(summary.get("power_avg")),
        avg_hr=_float_or_none(summary.get("heart_rate_avg")),
        max_hr=_float_or_none(summary.get("heart_rate_max")),
        avg_speed_ms=_float_or_none(summary.get("speed_avg")),
        avg_cadence=_float_or_none(summary.get("cadence_avg")),
    )


def _parse_fit_streams(fit_bytes: bytes) -> dict[str, list[float]]:
    """Extract time-series streams from a FIT file in memory."""
    power: list[float] = []
    heartrate: list[float] = []
    cadence: list[float] = []
    speed: list[float] = []
    altitude: list[float] = []

    with fitdecode.FitReader(io.BytesIO(fit_bytes)) as fr:
        for frame in fr:
            if frame.frame_type != fitdecode.FIT_FRAME_DATA:
                continue
            if frame.name != "record":
                continue

            pwr = frame.get_value("power")
            if pwr is not None:
                power.append(float(pwr))

            hr = frame.get_value("heart_rate")
            if hr is not None:
                heartrate.append(float(hr))

            cad = frame.get_value("cadence")
            if cad is not None:
                cadence.append(float(cad))

            spd = frame.get_value("speed")
            if spd is not None:
                speed.append(float(spd))  # m/s in FIT files

            alt = frame.get_value("altitude")
            if alt is not None:
                altitude.append(float(alt))

    result: dict[str, list[float]] = {}
    if power:
        result["power"] = power
    if heartrate:
        result["heartrate"] = heartrate
    if cadence:
        result["cadence"] = cadence
    if speed:
        result["speed"] = speed
    if altitude:
        result["altitude"] = altitude
    return result


def _int_or_none(v) -> int | None:
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _float_or_none(v) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None
