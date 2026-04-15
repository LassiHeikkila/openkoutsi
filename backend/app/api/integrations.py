"""
Generic provider integration routes.

Handles OAuth connect/callback, sync, and disconnect for all registered
providers (Strava, Wahoo, …). Adding a new provider requires only registering
it in providers/registry.py — no new router code needed.
"""

import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.core.config import settings
from backend.app.db.base import AsyncSessionLocal, get_session
from backend.app.models.orm import Activity, Athlete, ProviderConnection, User
from backend.app.services.provider_sync import ensure_fresh_token, sync_provider_activities
from backend.app.services.providers.registry import PROVIDERS

log = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations", tags=["integrations"])


# ── Helpers ────────────────────────────────────────────────────────────────

def _require_provider(provider: str) -> type:
    client_cls = PROVIDERS.get(provider)
    if client_cls is None:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    return client_cls


async def _get_athlete(user: User, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    return athlete


async def _get_connection(
    athlete: Athlete, provider: str, session: AsyncSession
) -> ProviderConnection:
    result = await session.execute(
        select(ProviderConnection).where(
            ProviderConnection.athlete_id == athlete.id,
            ProviderConnection.provider == provider,
        )
    )
    conn = result.scalar_one_or_none()
    if conn is None:
        raise HTTPException(status_code=400, detail=f"{provider} is not connected")
    return conn


def _encode_state(user_id: str, provider: str) -> str:
    return jwt.encode(
        {"sub": user_id, "purpose": f"{provider}_oauth"},
        settings.secret_key,
        algorithm="HS256",
    )


def _decode_state(state: str, provider: str) -> str:
    """Decode a state JWT and return the user_id. Raises JWTError on failure."""
    payload = jwt.decode(state, settings.secret_key, algorithms=["HS256"])
    if payload.get("purpose") != f"{provider}_oauth":
        raise JWTError("wrong purpose")
    return payload["sub"]


# ── Status ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def status(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the list of provider names the current athlete has connected."""
    result = await session.execute(
        select(ProviderConnection).where(
            ProviderConnection.athlete_id == (
                select(Athlete.id).where(Athlete.user_id == user.id).scalar_subquery()
            )
        )
    )
    connections = result.scalars().all()
    return {"connected": [c.provider for c in connections]}


# ── OAuth connect / callback ───────────────────────────────────────────────

@router.get("/{provider}/connect")
async def connect(
    provider: str,
    user: User = Depends(get_current_user),
):
    """Return the OAuth authorization URL for the given provider."""
    client_cls = _require_provider(provider)

    # Check provider-specific configuration
    if provider == "strava" and not settings.strava_client_id:
        raise HTTPException(status_code=501, detail="Strava is not configured")
    if provider == "wahoo" and not settings.wahoo_client_id:
        raise HTTPException(status_code=501, detail="Wahoo is not configured")

    state = _encode_state(str(user.id), provider)
    redirect_uri = f"{settings.api_url}/api/integrations/{provider}/callback"
    client = client_cls()
    url = client.get_oauth_url(state, redirect_uri)
    return {"url": url}


@router.get("/{provider}/callback")
async def callback(
    provider: str,
    code: str,
    state: str,
    session: AsyncSession = Depends(get_session),
):
    """Exchange OAuth code for tokens and persist the connection.

    Strava / Wahoo redirect the user's browser here, so Bearer auth is not
    available. We identify the user via the signed JWT in the ``state`` param.
    """
    client_cls = _require_provider(provider)

    try:
        user_id = _decode_state(state, provider)
    except (JWTError, KeyError, ValueError):
        return RedirectResponse(
            url=f"{settings.frontend_url}/profile?{provider}=error"
        )

    redirect_uri = f"{settings.api_url}/api/integrations/{provider}/callback"
    try:
        tokens = await client_cls.exchange_code(code, redirect_uri)  # type: ignore[call-arg]
    except httpx.HTTPStatusError:
        log.exception("%s code exchange failed", provider)
        return RedirectResponse(
            url=f"{settings.frontend_url}/profile?{provider}=error"
        )

    # Resolve athlete
    result = await session.execute(select(Athlete).where(Athlete.user_id == user_id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        return RedirectResponse(
            url=f"{settings.frontend_url}/profile?{provider}=error"
        )

    # Upsert ProviderConnection
    conn_result = await session.execute(
        select(ProviderConnection).where(
            ProviderConnection.athlete_id == athlete.id,
            ProviderConnection.provider == provider,
        )
    )
    conn = conn_result.scalar_one_or_none()
    if conn is None:
        conn = ProviderConnection(athlete_id=athlete.id, provider=provider)
        session.add(conn)

    conn.provider_athlete_id = tokens.get("provider_athlete_id") or conn.provider_athlete_id
    conn.access_token = tokens["access_token"]
    conn.refresh_token = tokens["refresh_token"]
    conn.token_expires_at = datetime.fromtimestamp(
        tokens["expires_at"], tz=timezone.utc
    )
    await session.commit()

    return RedirectResponse(
        url=f"{settings.frontend_url}/profile?{provider}=connected"
    )


# ── Sync ───────────────────────────────────────────────────────────────────

@router.post("/{provider}/sync")
async def sync(
    provider: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Trigger a full history import from the given provider in the background."""
    _require_provider(provider)
    athlete = await _get_athlete(user, session)
    await _get_connection(athlete, provider, session)  # ensure connected
    background_tasks.add_task(_bg_provider_sync, athlete.id, provider)
    return {"status": "sync started"}


async def _bg_provider_sync(athlete_id: str, provider: str) -> None:
    from backend.app.services.metrics_engine import recalculate_from

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Athlete).where(Athlete.id == athlete_id))
        athlete = result.scalar_one()

        conn_result = await session.execute(
            select(ProviderConnection).where(
                ProviderConnection.athlete_id == athlete_id,
                ProviderConnection.provider == provider,
            )
        )
        conn = conn_result.scalar_one_or_none()
        if conn is None:
            log.warning("No connection for athlete %s / provider %s", athlete_id, provider)
            return

        try:
            count, earliest = await sync_provider_activities(athlete, conn, session)
        except Exception:
            log.exception("%s sync failed for athlete %s", provider, athlete_id)
            return

        if count > 0 and earliest is not None:
            await recalculate_from(athlete_id, earliest, session)

        log.info(
            "%s sync complete: %d new activities for athlete %s",
            provider, count, athlete_id,
        )


# ── Disconnect ─────────────────────────────────────────────────────────────

@router.delete("/{provider}/disconnect", status_code=204)
async def disconnect(
    provider: str,
    delete_data: bool = Query(False, description="Also delete all activities imported from this provider"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Revoke the provider token and remove the stored connection.

    Pass ``delete_data=true`` to also permanently delete all activities that
    were imported from this provider.
    """
    _require_provider(provider)
    athlete = await _get_athlete(user, session)
    conn = await _get_connection(athlete, provider, session)

    if conn.access_token:
        try:
            client_cls = PROVIDERS[provider]
            await client_cls.revoke_token(conn.access_token)  # type: ignore[call-arg]
        except Exception:
            pass  # best-effort

    if delete_data:
        # Find the earliest deleted activity's date for metrics recalculation.
        earliest_result = await session.execute(
            select(Activity.start_time)
            .where(
                Activity.athlete_id == athlete.id,
                Activity.source == provider,
            )
            .order_by(Activity.start_time.asc())
            .limit(1)
        )
        earliest_row = earliest_result.scalar_one_or_none()

        await session.execute(
            delete(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.source == provider,
            )
        )

        if earliest_row is not None:
            earliest_date = (
                earliest_row.date()
                if hasattr(earliest_row, "date")
                else earliest_row
            )
            from backend.app.services.metrics_engine import recalculate_from
            await recalculate_from(athlete.id, earliest_date, session)

    await session.delete(conn)
    await session.commit()
