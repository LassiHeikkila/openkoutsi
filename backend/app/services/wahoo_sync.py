"""
Wahoo webhook event processing.

Handles incoming workout_summary events posted directly to the main backend.
Full activity sync is handled by the generic provider_sync.py pipeline.
"""

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.orm import Activity, Athlete, ProviderConnection
from backend.app.services.provider_sync import _import_activity, ensure_fresh_token
from backend.app.services.providers.wahoo import WahooClient, _normalize_workout

log = logging.getLogger(__name__)

_DUPLICATE_WINDOW = timedelta(seconds=30)

_wahoo_client = WahooClient()


async def process_wahoo_webhook(payload: dict, session: AsyncSession) -> None:
    """
    Handle a single Wahoo workout_summary webhook event.

    Payload structure:
    {
        "event_type": "workout_summary",
        "webhook_token": "<configured token>",
        "user": {"id": <wahoo_user_id>},
        "workout_summary": {...},
        "workout": {"id": ..., "starts": ..., "workout_type_id": ..., "workout_summary": {...}}
    }
    """
    wahoo_user_id = str(payload.get("user", {}).get("id", ""))
    if not wahoo_user_id:
        log.warning("Wahoo webhook missing user.id — ignoring")
        return

    # Merge top-level workout_summary into workout dict in case it isn't nested there
    workout = dict(payload.get("workout") or {})
    if not workout:
        log.warning("Wahoo webhook missing workout object — ignoring")
        return
    if not workout.get("workout_summary") and payload.get("workout_summary"):
        workout["workout_summary"] = payload["workout_summary"]

    norm = _normalize_workout(workout)

    # Resolve athlete via provider_connections
    conn_result = await session.execute(
        select(ProviderConnection).where(
            ProviderConnection.provider == "wahoo",
            ProviderConnection.provider_athlete_id == wahoo_user_id,
        )
    )
    conn = conn_result.scalar_one_or_none()
    if conn is None:
        log.warning("Wahoo webhook for unknown user %s — ignoring", wahoo_user_id)
        return

    athlete_result = await session.execute(
        select(Athlete).where(Athlete.id == conn.athlete_id)
    )
    athlete = athlete_result.scalar_one_or_none()
    if athlete is None:
        return

    # Already imported from Wahoo — idempotent
    dupe = await session.execute(
        select(Activity).where(
            Activity.athlete_id == athlete.id,
            Activity.source == "wahoo",
            Activity.external_id == norm.external_id,
        )
    )
    if dupe.scalar_one_or_none() is not None:
        log.debug("Wahoo webhook: activity %s already imported — skipping", norm.external_id)
        return

    # FIT upload cross-source: link instead of creating a new row
    cross_upload = await session.execute(
        select(Activity).where(
            Activity.athlete_id == athlete.id,
            Activity.external_id.is_(None),
            Activity.start_time >= norm.start_time - _DUPLICATE_WINDOW,
            Activity.start_time <= norm.start_time + _DUPLICATE_WINDOW,
        )
    )
    existing_upload = cross_upload.scalar_one_or_none()
    if existing_upload is not None:
        existing_upload.external_id = norm.external_id
        if existing_upload.source == "upload":
            existing_upload.source = "wahoo"
        await session.commit()
        return

    # Cross-provider duplicate: same workout already imported from another provider
    # (e.g. Strava). Import Wahoo's copy (FIT streams) but suppress TSS.
    cross_prov = await session.execute(
        select(Activity).where(
            Activity.athlete_id == athlete.id,
            Activity.source != "wahoo",
            Activity.duplicate_of_id.is_(None),
            Activity.start_time >= norm.start_time - _DUPLICATE_WINDOW,
            Activity.start_time <= norm.start_time + _DUPLICATE_WINDOW,
        )
    )
    existing_prov = cross_prov.scalar_one_or_none()
    duplicate_of_id = existing_prov.id if existing_prov is not None else None

    access_token = await ensure_fresh_token(conn, session)
    activity = await _import_activity(
        norm, athlete, _wahoo_client, access_token, session, duplicate_of_id=duplicate_of_id
    )

    if activity.start_time and not duplicate_of_id:
        from backend.app.services.metrics_engine import recalculate_from
        start_date = (
            activity.start_time.date()
            if hasattr(activity.start_time, "date")
            else activity.start_time
        )
        await recalculate_from(athlete.id, start_date, session)

    app_cfg = athlete.app_settings or {}
    if app_cfg.get("auto_analyze") and not duplicate_of_id:
        from backend.app.core.config import settings as _settings
        if _settings.llm_base_url:
            import asyncio
            from backend.app.services.llm_activity_analyzer import analyze_activity_bg
            activity.analysis_status = "pending"
            await session.commit()
            asyncio.create_task(analyze_activity_bg(activity.id, athlete.id))
