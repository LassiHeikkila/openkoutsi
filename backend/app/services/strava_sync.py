"""
Strava webhook event processing.

Full activity sync is now handled by the generic provider_sync.py pipeline.
This module handles only the Strava Bridge webhook events (create / update /
delete) which require Strava-specific knowledge about the bridge event schema.
"""

import logging
from datetime import timedelta, timezone
from datetime import datetime

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
from backend.app.services.providers.base import NormalizedActivity
from backend.app.services.providers.strava import StravaProviderClient

log = logging.getLogger(__name__)

_strava_client = StravaProviderClient()


# ── Webhook event processing ──────────────────────────────────────────────

async def process_webhook_event(event: dict, session: AsyncSession) -> None:
    """
    Handle a single bridge event. Event structure (from bridge GET /events/pending):
    {
        "id": "<bridge-uuid>",
        "strava_event_type": "create" | "update" | "delete",
        "strava_owner_id": "<strava athlete id>",
        "payload": {
            "object_type": "activity",
            "object_id": <strava activity id>,
            "aspect_type": "create" | ...,
            "updates": {...},
            ...
        }
    }
    """
    if event.get("strava_event_type") not in ("create", "update", "delete"):
        return

    payload = event.get("payload", {})
    if payload.get("object_type") != "activity":
        return

    aspect_type = event["strava_event_type"]
    strava_activity_id = str(payload.get("object_id", ""))
    strava_owner_id = str(event["strava_owner_id"])

    # Resolve the local athlete via provider_connections
    conn_result = await session.execute(
        select(ProviderConnection).where(
            ProviderConnection.provider == "strava",
            ProviderConnection.provider_athlete_id == strava_owner_id,
        )
    )
    conn = conn_result.scalar_one_or_none()
    if conn is None:
        return  # unknown owner — ignore

    athlete_result = await session.execute(
        select(Athlete).where(Athlete.id == conn.athlete_id)
    )
    athlete = athlete_result.scalar_one_or_none()
    if athlete is None:
        return

    if aspect_type == "create":
        # Skip if already imported for this athlete (idempotent)
        dupe = await session.execute(
            select(ActivitySource)
            .join(Activity, ActivitySource.activity_id == Activity.id)
            .where(
                Activity.athlete_id == athlete.id,
                ActivitySource.provider == "strava",
                ActivitySource.external_id == strava_activity_id,
            )
        )
        if dupe.scalar_one_or_none() is not None:
            return

        access_token = await ensure_fresh_token(conn, session)

        # Fetch full activity from Strava
        import httpx as _httpx
        async with _httpx.AsyncClient() as http:
            r = await http.get(
                f"https://www.strava.com/api/v3/activities/{strava_activity_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            r.raise_for_status()
            raw = r.json()

        raw_start = datetime.fromisoformat(raw["start_date"].replace("Z", "+00:00"))
        duration_s = raw.get("moving_time") or raw.get("elapsed_time") or 0

        norm = NormalizedActivity(
            external_id=strava_activity_id,
            source="strava",
            name=raw.get("name"),
            sport_type=raw.get("sport_type") or raw.get("type"),
            start_time=raw_start,
            duration_s=duration_s,
            distance_m=raw.get("distance"),
            elevation_m=raw.get("total_elevation_gain"),
            avg_power=raw.get("average_watts"),
            avg_hr=raw.get("average_heartrate"),
            max_hr=raw.get("max_heartrate"),
            avg_speed_ms=raw.get("average_speed"),
            avg_cadence=raw.get("average_cadence"),
        )

        # Check for existing Activity at the same time window
        existing_result = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.start_time >= raw_start - _DUPLICATE_WINDOW,
                Activity.start_time <= raw_start + _DUPLICATE_WINDOW,
            )
        )
        existing_act = existing_result.scalar_one_or_none()

        if existing_act is not None:
            # Same real-world workout — attach a Strava source.
            new_src = ActivitySource(
                activity_id=existing_act.id,
                provider="strava",
                external_id=strava_activity_id,
            )
            session.add(new_src)
            await session.flush()

            # Strava has no FIT download, so priority is always 3.
            strava_priority = _source_priority("strava", False)
            if strava_priority < _winning_priority(existing_act):
                await _repopulate_activity(
                    existing_act, new_src, norm, _strava_client, access_token, athlete, session
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
        else:
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
                provider="strava",
                external_id=strava_activity_id,
            )
            session.add(src)
            await session.flush()

            await _populate_activity(activity, src, norm, _strava_client, access_token, athlete, session)

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

    elif aspect_type == "delete":
        # Find the ActivitySource for this Strava activity
        src_result = await session.execute(
            select(ActivitySource)
            .join(Activity, ActivitySource.activity_id == Activity.id)
            .where(
                Activity.athlete_id == athlete.id,
                ActivitySource.provider == "strava",
                ActivitySource.external_id == strava_activity_id,
            )
        )
        src = src_result.scalar_one_or_none()
        if src is None:
            return

        act = src.activity
        start_date = (
            act.start_time.date()
            if act.start_time and hasattr(act.start_time, "date")
            else None
        )

        await session.delete(src)
        await session.flush()

        # If the activity has no remaining sources, delete it entirely.
        remaining = await session.execute(
            select(ActivitySource).where(ActivitySource.activity_id == act.id)
        )
        if remaining.scalar_one_or_none() is None:
            await session.delete(act)

        await session.commit()

        if start_date:
            from backend.app.services.metrics_engine import recalculate_from
            await recalculate_from(athlete.id, start_date, session)

    elif aspect_type == "update":
        updates = payload.get("updates", {})
        if not updates:
            return

        # Find the Activity via its Strava ActivitySource
        src_result = await session.execute(
            select(ActivitySource)
            .join(Activity, ActivitySource.activity_id == Activity.id)
            .where(
                Activity.athlete_id == athlete.id,
                ActivitySource.provider == "strava",
                ActivitySource.external_id == strava_activity_id,
            )
        )
        src = src_result.scalar_one_or_none()
        if src is None:
            return

        act = src.activity
        if "title" in updates:
            act.name = updates["title"]
        if "type" in updates or "sport_type" in updates:
            act.sport_type = updates.get("sport_type") or updates.get("type")
        await session.commit()
