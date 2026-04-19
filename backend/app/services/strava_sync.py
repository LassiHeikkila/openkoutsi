"""
Strava webhook event processing.

Full activity sync is now handled by the generic provider_sync.py pipeline.
This module handles only the Strava Bridge webhook events (create / update /
delete) which require Strava-specific knowledge about the bridge event schema.
"""

import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.orm import Activity, ActivityStream, Athlete, ProviderConnection
from backend.app.services.provider_sync import ensure_fresh_token
from backend.app.services.providers.strava import StravaProviderClient
from backend.app.services.training_math import calculate_tss, normalized_power

log = logging.getLogger(__name__)

_DUPLICATE_WINDOW = timedelta(seconds=30)

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
        # Skip if already imported (idempotent)
        dupe = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.source == "strava",
                Activity.external_id == strava_activity_id,
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

        # Cross-source duplicate: a FIT upload may already exist for this activity.
        cross = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.external_id.is_(None),
                Activity.start_time >= raw_start - _DUPLICATE_WINDOW,
                Activity.start_time <= raw_start + _DUPLICATE_WINDOW,
            )
        )
        existing_upload = cross.scalar_one_or_none()
        if existing_upload is not None:
            existing_upload.external_id = strava_activity_id
            existing_upload.source = "strava"
            await session.commit()
            return

        # Cross-provider duplicate: same workout may have arrived from Wahoo already.
        # Import Strava's copy (keeping its own metadata) but suppress TSS.
        cross_prov = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.source != "strava",
                Activity.duplicate_of_id.is_(None),
                Activity.start_time >= raw_start - _DUPLICATE_WINDOW,
                Activity.start_time <= raw_start + _DUPLICATE_WINDOW,
            )
        )
        existing_prov = cross_prov.scalar_one_or_none()
        duplicate_of_id = existing_prov.id if existing_prov is not None else None

        activity = await _import_strava_activity(raw, athlete, conn, session, duplicate_of_id=duplicate_of_id)

        if activity.start_time:
            from backend.app.services.metrics_engine import recalculate_from
            start_date = (
                activity.start_time.date()
                if hasattr(activity.start_time, "date")
                else activity.start_time
            )
            await recalculate_from(athlete.id, start_date, session)

        app_cfg = athlete.app_settings or {}
        if app_cfg.get("auto_analyze"):
            from backend.app.core.config import settings as _settings
            if _settings.llm_base_url:
                import asyncio
                from backend.app.services.llm_activity_analyzer import analyze_activity_bg
                activity.analysis_status = "pending"
                await session.commit()
                asyncio.create_task(analyze_activity_bg(activity.id, athlete.id))

    elif aspect_type == "delete":
        result = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.source == "strava",
                Activity.external_id == strava_activity_id,
            )
        )
        activity = result.scalar_one_or_none()
        if activity is None:
            return

        start_date = (
            activity.start_time.date()
            if activity.start_time and hasattr(activity.start_time, "date")
            else None
        )
        await session.delete(activity)
        await session.commit()

        if start_date:
            from backend.app.services.metrics_engine import recalculate_from
            await recalculate_from(athlete.id, start_date, session)

    elif aspect_type == "update":
        updates = payload.get("updates", {})
        if not updates:
            return

        result = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.source == "strava",
                Activity.external_id == strava_activity_id,
            )
        )
        activity = result.scalar_one_or_none()
        if activity is None:
            return

        if "title" in updates:
            activity.name = updates["title"]
        if "type" in updates or "sport_type" in updates:
            activity.sport_type = updates.get("sport_type") or updates.get("type")
        await session.commit()


# ── Single activity import (webhook-specific) ─────────────────────────────

async def _import_strava_activity(
    raw: dict,
    athlete: Athlete,
    conn: ProviderConnection,
    session: AsyncSession,
    duplicate_of_id: str | None = None,
) -> Activity:
    strava_id = str(raw["id"])
    start_time = datetime.fromisoformat(raw["start_date"].replace("Z", "+00:00"))

    access_token = await ensure_fresh_token(conn, session)

    # Fetch streams (best-effort)
    try:
        streams_raw = await _strava_client.get_activity_streams(access_token, strava_id)
    except Exception:
        streams_raw = {}

    power_data = streams_raw.get("power", [])
    hr_data = streams_raw.get("heartrate", [])
    cadence_data = streams_raw.get("cadence", [])
    speed_data = streams_raw.get("speed", [])
    altitude_data = streams_raw.get("altitude", [])

    np = normalized_power(power_data) if power_data else None
    avg_hr = (sum(hr_data) / len(hr_data)) if hr_data else raw.get("average_heartrate")
    duration_s = raw.get("elapsed_time", 0)

    tss, intensity_factor = calculate_tss(
        duration_s, np, avg_hr, athlete.ftp, athlete.max_hr
    )

    activity = Activity(
        id=str(uuid.uuid4()),
        athlete_id=athlete.id,
        external_id=strava_id,
        source="strava",
        name=raw.get("name"),
        sport_type=raw.get("sport_type") or raw.get("type"),
        start_time=start_time,
        duration_s=duration_s,
        distance_m=raw.get("distance"),
        elevation_m=raw.get("total_elevation_gain"),
        avg_power=raw.get("average_watts"),
        normalized_power=np,
        avg_hr=avg_hr,
        avg_speed_ms=raw.get("average_speed"),
        avg_cadence=raw.get("average_cadence"),
        tss=None if duplicate_of_id else tss,
        intensity_factor=None if duplicate_of_id else intensity_factor,
        duplicate_of_id=duplicate_of_id,
        status="processed",
    )
    session.add(activity)
    await session.flush()

    for stream_type, data in [
        ("power", power_data),
        ("heartrate", hr_data),
        ("cadence", cadence_data),
        ("speed", speed_data),
        ("altitude", altitude_data),
    ]:
        if data:
            session.add(
                ActivityStream(
                    id=str(uuid.uuid4()),
                    activity_id=activity.id,
                    stream_type=stream_type,
                    data=data,
                )
            )

    await session.commit()
    await session.refresh(activity)
    return activity
