"""
Strava OAuth, sync, and disconnect routes.

Also exports `strava_bridge_poller()`, a long-running asyncio task started
by the app's lifespan that polls the bridge every 60 seconds.
"""

import asyncio
import logging
import urllib.parse
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.core.config import settings
from backend.app.db.base import AsyncSessionLocal, get_session
from backend.app.models.orm import Athlete, User
from backend.app.services.strava_client import StravaClient
from backend.app.services.strava_sync import process_webhook_event, sync_strava_activities

log = logging.getLogger(__name__)

router = APIRouter(prefix="/strava", tags=["strava"])

_STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
_STRAVA_SCOPE = "read,activity:read_all"


# ── Helper ────────────────────────────────────────────────────────────────

async def _get_connected_athlete(user: User, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if not athlete.strava_athlete_id:
        raise HTTPException(status_code=400, detail="Strava not connected")
    return athlete


# ── OAuth routes ──────────────────────────────────────────────────────────

@router.get("/connect")
async def connect(user: User = Depends(get_current_user)):
    """Return the Strava OAuth authorization URL for the current user.

    Encodes the user's ID in the OAuth `state` parameter (as a short-lived
    JWT) so the callback can identify the user without a session cookie.
    """
    if not settings.strava_client_id:
        raise HTTPException(status_code=501, detail="Strava not configured")

    state = jwt.encode(
        {"sub": str(user.id), "purpose": "strava_oauth"},
        settings.secret_key,
        algorithm="HS256",
    )

    callback_url = f"{settings.api_url}/api/strava/callback"
    params = {
        "client_id": settings.strava_client_id,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": _STRAVA_SCOPE,
        "approval_prompt": "auto",
        "state": state,
    }
    return {"url": f"{_STRAVA_AUTH_URL}?{urllib.parse.urlencode(params)}"}


@router.get("/callback")
async def callback(
    code: str = Query(...),
    state: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """Exchange the OAuth code for tokens.

    Strava redirects the user's browser here, so we cannot use a Bearer token.
    Instead we decode the `state` JWT to identify the user, then redirect the
    browser back to the frontend.
    """
    if not settings.strava_client_id:
        raise HTTPException(status_code=501, detail="Strava not configured")

    # Decode state to get user_id
    try:
        payload = jwt.decode(state, settings.secret_key, algorithms=["HS256"])
        if payload.get("purpose") != "strava_oauth":
            raise JWTError("wrong purpose")
        user_id: str = payload["sub"]
    except (JWTError, KeyError, ValueError):
        return RedirectResponse(url=f"{settings.frontend_url}/profile?strava=error")

    try:
        tokens = await StravaClient.exchange_code(code)
    except httpx.HTTPStatusError:
        log.exception("Strava code exchange failed")
        return RedirectResponse(url=f"{settings.frontend_url}/profile?strava=error")

    result = await session.execute(select(Athlete).where(Athlete.user_id == user_id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        return RedirectResponse(url=f"{settings.frontend_url}/profile?strava=error")

    strava_athlete = tokens.get("athlete", {})
    athlete.strava_athlete_id = str(strava_athlete.get("id", ""))
    athlete.strava_access_token = tokens["access_token"]
    athlete.strava_refresh_token = tokens["refresh_token"]
    athlete.strava_token_expires_at = datetime.fromtimestamp(
        tokens["expires_at"], tz=timezone.utc
    )
    await session.commit()

    return RedirectResponse(url=f"{settings.frontend_url}/profile?strava=connected")


# ── Sync route ────────────────────────────────────────────────────────────

@router.post("/sync")
async def sync(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Trigger a full Strava history import in the background."""
    athlete = await _get_connected_athlete(user, session)
    background_tasks.add_task(_bg_full_sync, athlete.id)
    return {"status": "sync started", "synced": 0}


async def _bg_full_sync(athlete_id: str) -> None:
    from backend.app.services.metrics_engine import recalculate_from

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Athlete).where(Athlete.id == athlete_id))
        athlete = result.scalar_one()

        try:
            count, earliest = await sync_strava_activities(athlete, session)
        except Exception:
            log.exception("Strava full sync failed for athlete %s", athlete_id)
            return

        if count > 0 and earliest is not None:
            await recalculate_from(athlete_id, earliest, session)

        log.info("Strava sync complete: %d new activities for athlete %s", count, athlete_id)


# ── Disconnect route ──────────────────────────────────────────────────────

@router.delete("/disconnect", status_code=204)
async def disconnect(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Revoke Strava access and clear stored tokens."""
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    if athlete.strava_access_token:
        try:
            await StravaClient.deauthorize(athlete.strava_access_token)
        except Exception:
            pass  # best-effort; clear tokens regardless

    athlete.strava_athlete_id = None
    athlete.strava_access_token = None
    athlete.strava_refresh_token = None
    athlete.strava_token_expires_at = None
    await session.commit()


# ── Bridge poller (long-running background task) ───────────────────────────

async def strava_bridge_poller() -> None:
    """
    Polls the Strava Bridge every 60 seconds, processes any pending webhook
    events, and claims them so they aren't reprocessed.

    Silently no-ops if BRIDGE_URL or BRIDGE_SECRET are not configured.
    """
    if not settings.bridge_url or not settings.bridge_secret:
        log.info("Strava bridge not configured — poller inactive")
        return

    log.info("Strava bridge poller started (polling %s)", settings.bridge_url)

    while True:
        await asyncio.sleep(60)
        try:
            await _poll_bridge_once()
        except Exception:
            log.exception("Strava bridge poll failed")


async def _poll_bridge_once() -> None:
    async with httpx.AsyncClient(timeout=10.0) as http:
        # Fetch pending events
        try:
            r = await http.get(
                f"{settings.bridge_url}/events/pending",
                headers={"Authorization": f"Bearer {settings.bridge_secret}"},
            )
            r.raise_for_status()
            events: list[dict] = r.json()
        except Exception:
            log.warning("Could not fetch events from bridge")
            return

        for event in events:
            event_id = event.get("id", "")

            # Process in its own session so one bad event doesn't block others
            async with AsyncSessionLocal() as session:
                try:
                    await process_webhook_event(event, session)
                except Exception:
                    log.exception("Failed to process bridge event %s", event_id)

            # Claim regardless of processing outcome (avoid infinite retry loops)
            try:
                await http.post(
                    f"{settings.bridge_url}/events/{event_id}/claim",
                    headers={"Authorization": f"Bearer {settings.bridge_secret}"},
                )
            except Exception:
                log.warning("Could not claim bridge event %s", event_id)
