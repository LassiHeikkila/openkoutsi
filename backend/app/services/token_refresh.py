"""Background task: proactively refresh provider OAuth tokens before they expire."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from backend.app.db.registry import _RegistrySessionLocal
from backend.app.models.registry_orm import ProviderConnection
from backend.app.services.provider_sync import ensure_fresh_token

log = logging.getLogger(__name__)

_REFRESH_HORIZON = timedelta(minutes=60)
_LOOP_INTERVAL_SECONDS = 30 * 60  # 30 minutes


async def token_refresh_loop() -> None:
    """Runs every 30 minutes, proactively refreshing provider tokens expiring within 60 minutes."""
    log.info("Provider token refresh loop started")
    while True:
        await asyncio.sleep(_LOOP_INTERVAL_SECONDS)
        try:
            await _refresh_expiring_tokens()
        except Exception:
            log.exception("Provider token refresh loop iteration failed")


async def _refresh_expiring_tokens() -> None:
    """Query for Strava/Wahoo tokens expiring within the next 60 minutes and refresh them."""
    horizon = datetime.now(timezone.utc) + _REFRESH_HORIZON

    async with _RegistrySessionLocal() as session:
        result = await session.execute(
            select(ProviderConnection.id).where(
                ProviderConnection.provider.in_(["strava", "wahoo"]),
                ProviderConnection.refresh_token.isnot(None),
                ProviderConnection.token_expires_at.isnot(None),
                ProviderConnection.token_expires_at <= horizon,
            )
        )
        conn_ids = result.scalars().all()

    if not conn_ids:
        log.debug("No provider tokens require proactive refresh")
        return

    log.info("Proactively refreshing %d expiring provider token(s)", len(conn_ids))

    for conn_id in conn_ids:
        async with _RegistrySessionLocal() as session:
            conn = await session.get(ProviderConnection, conn_id)
            if conn is None:
                continue
            try:
                await ensure_fresh_token(conn, session, lookahead=_REFRESH_HORIZON)
                log.debug("Refreshed %s token for user %s", conn.provider, conn.user_id)
            except Exception:
                log.exception(
                    "Failed to refresh %s token for user %s",
                    conn.provider,
                    conn.user_id,
                )
