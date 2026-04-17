"""
Generic provider sync pipeline.

Works with any provider registered in the PROVIDERS registry. The logic is
identical regardless of source: refresh tokens, paginate activities, dedup,
fetch streams, compute TSS, persist.
"""

import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.orm import Activity, ActivityDistanceBest, ActivityPowerBest, ActivityStream, Athlete, ProviderConnection
from backend.app.services.providers.registry import PROVIDERS
from backend.app.services.training_math import calculate_tss, compute_distance_bests, compute_power_bests, normalized_power

log = logging.getLogger(__name__)

_DUPLICATE_WINDOW = timedelta(seconds=30)


# ── Token management ──────────────────────────────────────────────────────

async def ensure_fresh_token(
    conn: ProviderConnection, session: AsyncSession
) -> str:
    """Refresh the access token if it has expired. Returns current token."""
    # SQLite may return timezone-naive datetimes even for timezone-aware columns;
    # normalise to UTC before comparing.
    expires_at = conn.token_expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if (
        expires_at
        and datetime.now(timezone.utc) >= expires_at
        and conn.refresh_token
    ):
        client_cls = PROVIDERS.get(conn.provider)
        if client_cls is None:
            log.warning("Unknown provider %s — cannot refresh token", conn.provider)
            return conn.access_token or ""

        tokens = await client_cls.refresh_access_token(conn.refresh_token)  # type: ignore[arg-type]
        conn.access_token = tokens["access_token"]
        conn.refresh_token = tokens["refresh_token"]
        conn.token_expires_at = datetime.fromtimestamp(
            tokens["expires_at"], tz=timezone.utc
        )
        await session.commit()

    return conn.access_token or ""


# ── Full sync ─────────────────────────────────────────────────────────────

async def sync_provider_activities(
    athlete: Athlete,
    connection: ProviderConnection,
    session: AsyncSession,
) -> tuple[int, date | None]:
    """
    Import all activities from a provider that aren't already in the database.

    Returns (count_imported, earliest_start_date) so the caller can trigger
    metrics recalculation from the right point in time.
    """
    provider_name = connection.provider
    client_cls = PROVIDERS.get(provider_name)
    if client_cls is None:
        log.error("No client registered for provider %s", provider_name)
        return 0, None

    access_token = await ensure_fresh_token(connection, session)
    client = client_cls()

    count = 0
    earliest: date | None = None
    page = 1

    while True:
        activities = await client.list_activities(access_token, page)
        if not activities:
            break

        for norm in activities:
            ext_id = norm.external_id

            # Already imported from this provider — skip.
            dupe = await session.execute(
                select(Activity).where(
                    Activity.athlete_id == athlete.id,
                    Activity.source == provider_name,
                    Activity.external_id == ext_id,
                )
            )
            if dupe.scalar_one_or_none() is not None:
                continue

            # Cross-source duplicate: same workout uploaded via FIT file.
            # Link the existing record instead of creating a new one.
            cross = await session.execute(
                select(Activity).where(
                    Activity.athlete_id == athlete.id,
                    Activity.external_id.is_(None),
                    Activity.start_time >= norm.start_time - _DUPLICATE_WINDOW,
                    Activity.start_time <= norm.start_time + _DUPLICATE_WINDOW,
                )
            )
            existing = cross.scalar_one_or_none()
            if existing is not None:
                existing.external_id = ext_id
                if existing.source == "upload":
                    existing.source = provider_name
                await session.commit()
                continue

            activity = await _import_activity(norm, athlete, client, access_token, session)
            count += 1

            if activity.start_time:
                day = (
                    activity.start_time.date()
                    if hasattr(activity.start_time, "date")
                    else activity.start_time
                )
                if earliest is None or day < earliest:
                    earliest = day

            # Optional auto-analysis
            app_cfg = athlete.app_settings or {}
            if app_cfg.get("auto_analyze"):
                from backend.app.core.config import settings as _settings

                if _settings.llm_base_url:
                    from backend.app.services.llm_activity_analyzer import analyze_activity_bg

                    activity.analysis_status = "pending"
                    await session.commit()
                    asyncio.create_task(analyze_activity_bg(activity.id, athlete.id))

        page += 1

    return count, earliest


# ── Single activity import ─────────────────────────────────────────────────

async def _import_activity(
    norm,
    athlete: Athlete,
    client,
    access_token: str,
    session: AsyncSession,
) -> Activity:
    # Fetch time-series streams (best-effort)
    try:
        streams_raw = await client.get_activity_streams(access_token, norm.external_id)
    except Exception:
        streams_raw = {}

    power_data = streams_raw.get("power", [])
    hr_data = streams_raw.get("heartrate", [])
    cadence_data = streams_raw.get("cadence", [])
    speed_data = streams_raw.get("speed", [])
    altitude_data = streams_raw.get("altitude", [])

    np = normalized_power(power_data) if power_data else None
    avg_hr = (
        (sum(hr_data) / len(hr_data)) if hr_data else norm.avg_hr
    )
    duration_s = norm.duration_s or 0

    tss, intensity_factor = calculate_tss(
        duration_s, np, avg_hr, athlete.ftp, athlete.max_hr
    )

    activity = Activity(
        id=str(uuid.uuid4()),
        athlete_id=athlete.id,
        external_id=norm.external_id,
        source=norm.source,
        name=norm.name,
        sport_type=norm.sport_type,
        start_time=norm.start_time,
        duration_s=norm.duration_s,
        distance_m=norm.distance_m,
        elevation_m=norm.elevation_m,
        avg_power=norm.avg_power or (sum(power_data) / len(power_data) if power_data else None),
        normalized_power=np,
        avg_hr=avg_hr,
        avg_speed_ms=norm.avg_speed_ms,
        avg_cadence=norm.avg_cadence,
        tss=tss,
        intensity_factor=intensity_factor,
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

    if power_data:
        for duration_s, power_w in compute_power_bests(power_data).items():
            session.add(
                ActivityPowerBest(
                    activity_id=activity.id,
                    athlete_id=athlete.id,
                    duration_s=duration_s,
                    power_w=power_w,
                    activity_start_time=activity.start_time,
                )
            )

    if speed_data:
        for distance_m, time_s in compute_distance_bests(speed_data).items():
            session.add(
                ActivityDistanceBest(
                    activity_id=activity.id,
                    athlete_id=athlete.id,
                    distance_m=distance_m,
                    time_s=time_s,
                    activity_start_time=activity.start_time,
                )
            )

    await session.commit()
    await session.refresh(activity)
    return activity
