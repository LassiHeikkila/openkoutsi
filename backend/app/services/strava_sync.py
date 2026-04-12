"""
Strava activity import and webhook event processing.
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.orm import Activity, ActivityStream, Athlete
from backend.app.services.strava_client import StravaClient
from backend.app.services.training_math import calculate_tss, normalized_power


# ── Token management ──────────────────────────────────────────────────────

async def ensure_fresh_token(athlete: Athlete, session: AsyncSession) -> str:
    """Refresh the Strava access token if expired. Returns current access token."""
    if (
        athlete.strava_token_expires_at
        and datetime.now(timezone.utc) >= athlete.strava_token_expires_at
        and athlete.strava_refresh_token
    ):
        tokens = await StravaClient.refresh_token_request(athlete.strava_refresh_token)
        athlete.strava_access_token = tokens["access_token"]
        athlete.strava_refresh_token = tokens["refresh_token"]
        athlete.strava_token_expires_at = datetime.fromtimestamp(
            tokens["expires_at"], tz=timezone.utc
        )
        await session.commit()
    return athlete.strava_access_token or ""


# ── Full sync ─────────────────────────────────────────────────────────────

async def sync_strava_activities(
    athlete: Athlete, session: AsyncSession
) -> tuple[int, date | None]:
    """
    Import all Strava activities that aren't already in the database.
    Returns (count_imported, earliest_start_date) so the caller can
    trigger metrics recalculation from the right point.
    """
    access_token = await ensure_fresh_token(athlete, session)
    client = StravaClient(access_token)

    count = 0
    earliest: date | None = None
    page = 1

    while True:
        activities = await client.get_activities(page=page, per_page=200)
        if not activities:
            break

        for raw in activities:
            strava_id = str(raw["id"])

            # Skip duplicates
            dupe = await session.execute(
                select(Activity).where(
                    Activity.athlete_id == athlete.id,
                    Activity.strava_id == strava_id,
                )
            )
            if dupe.scalar_one_or_none() is not None:
                continue

            activity = await _import_strava_activity(raw, athlete, client, session)
            count += 1

            if activity.start_time:
                day = (
                    activity.start_time.date()
                    if hasattr(activity.start_time, "date")
                    else activity.start_time
                )
                if earliest is None or day < earliest:
                    earliest = day

        page += 1

    return count, earliest


# ── Single activity import ────────────────────────────────────────────────

async def _import_strava_activity(
    raw: dict,
    athlete: Athlete,
    client: StravaClient,
    session: AsyncSession,
) -> Activity:
    strava_id = str(raw["id"])
    start_time = datetime.fromisoformat(raw["start_date"].replace("Z", "+00:00"))

    # Fetch streams (best-effort — activities may not have all streams)
    try:
        streams_raw = await client.get_streams(int(strava_id))
    except Exception:
        streams_raw = {}

    power_data = [float(v) for v in streams_raw.get("watts", {}).get("data", [])]
    hr_data = [float(v) for v in streams_raw.get("heartrate", {}).get("data", [])]
    cadence_data = [float(v) for v in streams_raw.get("cadence", {}).get("data", [])]
    speed_data = [
        float(v) for v in streams_raw.get("velocity_smooth", {}).get("data", [])
    ]
    altitude_data = [
        float(v) for v in streams_raw.get("altitude", {}).get("data", [])
    ]

    np = normalized_power(power_data) if power_data else None
    avg_hr = (
        (sum(hr_data) / len(hr_data)) if hr_data else raw.get("average_heartrate")
    )
    duration_s = raw.get("elapsed_time", 0)

    tss, intensity_factor = calculate_tss(
        duration_s, np, avg_hr, athlete.ftp, athlete.max_hr
    )

    activity = Activity(
        id=str(uuid.uuid4()),
        athlete_id=athlete.id,
        strava_id=strava_id,
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
        tss=tss,
        intensity_factor=intensity_factor,
        status="processed",
    )
    session.add(activity)
    await session.flush()  # get activity.id without committing yet

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


# ── Webhook event processing ──────────────────────────────────────────────

async def process_webhook_event(event: dict, session: AsyncSession) -> None:
    """
    Handle a single bridge event. Event structure (from bridge GET /events/pending):
    {
        "id": "<bridge-uuid>",
        "strava_event_type": "create" | "update" | "delete",
        "strava_owner_id": "<strava athlete id>",
        "payload": {  # original Strava webhook body
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
    strava_owner_id = event["strava_owner_id"]

    # Resolve the local athlete
    result = await session.execute(
        select(Athlete).where(Athlete.strava_athlete_id == strava_owner_id)
    )
    athlete = result.scalar_one_or_none()
    if athlete is None:
        return  # unknown owner — ignore

    if aspect_type == "create":
        # Skip if already imported (idempotent)
        dupe = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.strava_id == strava_activity_id,
            )
        )
        if dupe.scalar_one_or_none() is not None:
            return

        access_token = await ensure_fresh_token(athlete, session)
        client = StravaClient(access_token)
        raw = await client.get_activity(int(strava_activity_id))
        activity = await _import_strava_activity(raw, athlete, client, session)

        if activity.start_time:
            from backend.app.services.metrics_engine import recalculate_from

            start_date = (
                activity.start_time.date()
                if hasattr(activity.start_time, "date")
                else activity.start_time
            )
            await recalculate_from(athlete.id, start_date, session)

    elif aspect_type == "delete":
        result = await session.execute(
            select(Activity).where(
                Activity.athlete_id == athlete.id,
                Activity.strava_id == strava_activity_id,
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
                Activity.strava_id == strava_activity_id,
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
