"""
Wahoo webhook event processing.

Handles incoming workout_summary events posted directly to the main backend.
Full activity sync is handled by the generic provider_sync.py pipeline.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.orm import Activity, ActivitySource, Athlete, ProviderConnection
from backend.app.services.provider_sync import (
    _DUPLICATE_WINDOW,
    _populate_activity,
    _repopulate_activity,
    _winning_priority,
    _source_priority,
    ensure_fresh_token,
)
from backend.app.services.providers.wahoo import WahooClient, _normalize_workout

log = logging.getLogger(__name__)

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

    # Wahoo may send workout nested inside workout_summary (observed production structure)
    # or at the top level (documented structure). Support both.
    workout_summary = payload.get("workout_summary") or {}
    workout = dict(payload.get("workout") or workout_summary.get("workout") or {})
    if not workout:
        log.warning("Wahoo webhook missing workout object — ignoring")
        return
    if not workout.get("workout_summary"):
        workout["workout_summary"] = workout_summary

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

    # Idempotent: skip if this (provider, external_id) is already imported
    dupe = await session.execute(
        select(ActivitySource)
        .join(Activity, ActivitySource.activity_id == Activity.id)
        .where(
            Activity.athlete_id == athlete.id,
            ActivitySource.provider == "wahoo",
            ActivitySource.external_id == norm.external_id,
        )
    )
    if dupe.scalar_one_or_none() is not None:
        log.debug("Wahoo webhook: activity %s already imported — skipping", norm.external_id)
        return

    access_token = await ensure_fresh_token(conn, session)

    # Check for existing Activity at the same time window
    existing_result = await session.execute(
        select(Activity).where(
            Activity.athlete_id == athlete.id,
            Activity.start_time >= norm.start_time - _DUPLICATE_WINDOW,
            Activity.start_time <= norm.start_time + _DUPLICATE_WINDOW,
        )
    )
    existing_act = existing_result.scalar_one_or_none()

    if existing_act is not None:
        # Same real-world workout — attach a Wahoo source.
        new_src = ActivitySource(
            activity_id=existing_act.id,
            provider="wahoo",
            external_id=norm.external_id,
        )
        session.add(new_src)
        await session.flush()

        # Pre-fetch FIT to determine actual priority (Wahoo with FIT = priority 2,
        # without FIT = priority 4).
        prefetched_fit: bytes | None = None
        try:
            prefetched_fit = await _wahoo_client.download_fit_file(
                access_token, norm.external_id
            )
        except Exception:
            prefetched_fit = None

        actual_priority = _source_priority("wahoo", prefetched_fit is not None)
        if actual_priority < _winning_priority(existing_act):
            await _repopulate_activity(
                existing_act, new_src, norm, _wahoo_client, access_token,
                athlete, session, prefetched_fit=prefetched_fit,
            )
            if existing_act.start_time:
                from backend.app.services.metrics_engine import recalculate_from
                start_date = (
                    existing_act.start_time.date()
                    if hasattr(existing_act.start_time, "date")
                    else existing_act.start_time
                )
                await recalculate_from(athlete.id, start_date, session)
        else:
            await session.commit()
        return

    # New workout — create Activity + ActivitySource
    activity = Activity(
        athlete_id=athlete.id,
        name=norm.name,
        sport_type=norm.sport_type,
        start_time=norm.start_time,
        duration_s=norm.duration_s,
        distance_m=norm.distance_m,
        elevation_m=norm.elevation_m,
        avg_power=norm.avg_power,
        avg_hr=norm.avg_hr,
        max_hr=norm.max_hr,
        avg_speed_ms=norm.avg_speed_ms,
        avg_cadence=norm.avg_cadence,
        status="pending",
    )
    session.add(activity)
    await session.flush()

    src = ActivitySource(
        activity_id=activity.id,
        provider="wahoo",
        external_id=norm.external_id,
    )
    session.add(src)
    await session.flush()

    await _populate_activity(activity, src, norm, _wahoo_client, access_token, athlete, session)

    if activity.start_time:
        from backend.app.services.metrics_engine import recalculate_from
        start_date = (
            activity.start_time.date()
            if hasattr(activity.start_time, "date")
            else activity.start_time
        )
        await recalculate_from(athlete.id, start_date, session)

    app_cfg = athlete.app_settings or {}
    if app_cfg.get("auto_analyze") and app_cfg.get("llm_base_url"):
        import asyncio
        from backend.app.services.llm_activity_analyzer import analyze_activity_bg
        activity.analysis_status = "pending"
        await session.commit()
        asyncio.create_task(analyze_activity_bg(activity.id, athlete.id))
