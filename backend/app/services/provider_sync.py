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
from pathlib import Path

import fitdecode
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.file_encryption import encrypt_file
from backend.app.models.orm import Activity, ActivityDistanceBest, ActivityPowerBest, ActivityStream, Athlete, ProviderConnection
from backend.app.services.fit_processor import _resolve_sport_type
from backend.app.services.providers.registry import PROVIDERS
from backend.app.services.training_math import calculate_tss, compute_distance_bests, compute_power_bests, normalized_power
from openkoutsi.fit import summarizeWorkout

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

            # Cross-provider duplicate: same workout already imported from another provider.
            # Import the activity (keeping its streams) but suppress TSS so fitness
            # metrics aren't double-counted.
            cross_prov = await session.execute(
                select(Activity).where(
                    Activity.athlete_id == athlete.id,
                    Activity.source != provider_name,
                    Activity.duplicate_of_id.is_(None),
                    Activity.start_time >= norm.start_time - _DUPLICATE_WINDOW,
                    Activity.start_time <= norm.start_time + _DUPLICATE_WINDOW,
                )
            )
            existing_prov = cross_prov.scalar_one_or_none()
            duplicate_of_id = existing_prov.id if existing_prov is not None else None

            activity = await _import_activity(norm, athlete, client, access_token, session, duplicate_of_id=duplicate_of_id)
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
    duplicate_of_id: str | None = None,
) -> Activity:
    # ── FIT-first path (Wahoo and any future FIT-capable provider) ────────
    fit_bytes: bytes | None = None
    try:
        fit_bytes = await client.download_fit_file(access_token, norm.external_id)
    except Exception:
        fit_bytes = None

    if fit_bytes is not None:
        activity_id = str(uuid.uuid4())
        storage_dir = Path(settings.file_storage_path) / athlete.id
        storage_dir.mkdir(parents=True, exist_ok=True)
        fit_path = storage_dir / f"{activity_id}.fit"
        fit_path.write_bytes(fit_bytes)

        # Parse FIT synchronously (fitdecode is blocking)
        try:
            with fitdecode.FitReader(str(fit_path)) as fr:
                profile = summarizeWorkout(fr)
        except Exception:
            log.exception("FIT parsing failed for %s/%s", norm.source, norm.external_id)
            profile = None

        # Encrypt FIT file before writing anything to the DB
        encrypted = False
        try:
            encrypt_file(fit_path, athlete.user_id)
            encrypted = True
        except Exception:
            log.warning("FIT encryption failed for activity %s", activity_id)

        # Derive stream arrays and aggregate metrics from the FIT profile
        if profile is not None:
            power_data   = [float(v) for v in profile.power]
            hr_data      = [float(v) for v in profile.heartRate]
            cadence_data = [float(v) for v in profile.cadence]
            speed_ms     = [v / 3.6 for v in profile.speed]   # km/h → m/s
            alt_data     = [float(v) for v in profile.altitude]

            np_val    = normalized_power(power_data) if power_data else None
            avg_hr_v  = profile.avgHeartRate if hr_data else norm.avg_hr
            dur_v     = profile.duration or norm.duration_s or 0
            tss, intensity_factor = calculate_tss(dur_v, np_val, avg_hr_v, athlete.ftp, athlete.max_hr)

            activity = Activity(
                id=activity_id,
                athlete_id=athlete.id,
                external_id=norm.external_id,
                source=norm.source,
                name=norm.name or "Uploaded Activity",
                sport_type=norm.sport_type or _resolve_sport_type(profile.sport_type),
                start_time=profile.start_time or norm.start_time,
                duration_s=profile.duration,
                distance_m=float(profile.distance) if profile.distance else None,
                elevation_m=float(profile.elevationGain) if profile.elevationGain else None,
                avg_power=profile.avgPower if power_data else norm.avg_power,
                normalized_power=np_val,
                avg_hr=avg_hr_v,
                max_hr=profile.peakHR if hr_data else norm.max_hr,
                avg_speed_ms=(profile.avgSpeed / 3.6) if profile.speed else norm.avg_speed_ms,
                avg_cadence=float(profile.avgCadence) if profile.cadence else norm.avg_cadence,
                tss=None if duplicate_of_id else tss,
                intensity_factor=None if duplicate_of_id else intensity_factor,
                fit_file_path=str(fit_path),
                fit_file_encrypted=encrypted,
                duplicate_of_id=duplicate_of_id,
                status="processed",
            )
        else:
            # FIT parsing failed — fall back to summary data only
            power_data = hr_data = cadence_data = speed_ms = alt_data = []
            activity = Activity(
                id=activity_id,
                athlete_id=athlete.id,
                external_id=norm.external_id,
                source=norm.source,
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
                fit_file_path=str(fit_path),
                fit_file_encrypted=encrypted,
                duplicate_of_id=duplicate_of_id,
                status="processed",
            )

        session.add(activity)
        await session.flush()

        for stream_type, data in [
            ("power",     power_data),
            ("heartrate", hr_data),
            ("cadence",   cadence_data),
            ("speed",     speed_ms),
            ("altitude",  alt_data),
        ]:
            if data:
                session.add(ActivityStream(
                    id=str(uuid.uuid4()),
                    activity_id=activity.id,
                    stream_type=stream_type,
                    data=data,
                ))

        if power_data:
            for dur_s, pwr_w in compute_power_bests(power_data).items():
                session.add(ActivityPowerBest(
                    activity_id=activity.id,
                    athlete_id=athlete.id,
                    duration_s=dur_s,
                    power_w=pwr_w,
                    activity_start_time=activity.start_time,
                ))

        if speed_ms:
            for dist_m, time_s in compute_distance_bests(speed_ms).items():
                session.add(ActivityDistanceBest(
                    activity_id=activity.id,
                    athlete_id=athlete.id,
                    distance_m=dist_m,
                    time_s=time_s,
                    activity_start_time=activity.start_time,
                ))

        await session.commit()
        await session.refresh(activity)
        return activity

    # ── Stream-based fallback (Strava and providers without FIT download) ──
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
        max_hr=norm.max_hr,
        avg_speed_ms=norm.avg_speed_ms,
        avg_cadence=norm.avg_cadence,
        # Suppress TSS on cross-provider duplicates so fitness metrics aren't double-counted.
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
