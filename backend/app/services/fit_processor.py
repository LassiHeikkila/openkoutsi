import uuid
from datetime import datetime, timezone
from typing import Optional

import fitdecode
from sqlalchemy.ext.asyncio import AsyncSession

from openkoutsi.fit import summarizeWorkout
from backend.app.models.orm import Activity, ActivityStream, Athlete
from backend.app.services.training_math import normalized_power, calculate_tss


_FIT_SPORT_MAP = {
    "running": "Run",
    "cycling": "Ride",
    "training": "WeightTraining",
    "swimming": "Swim",
    "walking": "Walk",
    "hiking": "Hike",
}


def _resolve_sport_type(fit_sport: str | None) -> str:
    """Normalise a raw fitdecode sport string to a Strava-style name."""
    if fit_sport is None:
        return "Cycling"
    mapped = _FIT_SPORT_MAP.get(fit_sport.lower())
    if mapped:
        return mapped
    # Unknown sport: title-case the raw string rather than defaulting to Cycling.
    return fit_sport.title()


def read_fit_start_time(path: str) -> Optional[datetime]:
    """
    Extract just the start timestamp from a FIT file without full processing.
    Reads only until the first data record, so it's fast even for large files.
    Returns a UTC-aware datetime, or None if the file contains no timestamps.
    """
    try:
        with fitdecode.FitReader(path) as fr:
            for frame in fr:
                if frame.frame_type != fitdecode.FIT_FRAME_DATA:
                    continue
                if frame.name == "record":
                    ts = frame.get_value("timestamp")
                    if ts is not None:
                        if isinstance(ts, datetime) and ts.tzinfo is None:
                            ts = ts.replace(tzinfo=timezone.utc)
                        return ts
    except Exception:
        pass
    return None


async def process_fit_file(
    path: str,
    athlete: Athlete,
    activity: Activity,
    session: AsyncSession,
) -> Activity:
    with fitdecode.FitReader(path) as fr:
        profile = summarizeWorkout(fr)

    np = normalized_power(profile.power) if profile.power else None
    tss, intensity_factor = calculate_tss(
        profile.duration,
        np,
        profile.avgHeartRate if profile.heartRate else None,
        athlete.ftp,
        athlete.max_hr,
    )

    activity.name = activity.name or "Uploaded Activity"
    activity.sport_type = activity.sport_type or _resolve_sport_type(profile.sport_type)
    activity.start_time = profile.start_time
    activity.duration_s = profile.duration
    activity.distance_m = float(profile.distance)
    activity.elevation_m = float(profile.elevationGain)
    activity.avg_power = profile.avgPower if profile.power else None
    activity.normalized_power = np
    activity.avg_hr = profile.avgHeartRate if profile.heartRate else None
    activity.max_hr = profile.peakHR if profile.heartRate else None
    activity.avg_speed_ms = (profile.avgSpeed / 3.6) if profile.speed else None
    activity.avg_cadence = float(profile.avgCadence) if profile.cadence else None
    activity.tss = tss
    activity.intensity_factor = intensity_factor
    activity.status = "processed"

    stream_map = {
        "power": [float(v) for v in profile.power],
        "heartrate": [float(v) for v in profile.heartRate],
        "cadence": [float(v) for v in profile.cadence],
        "speed": [v / 3.6 for v in profile.speed],  # km/h -> m/s
    }
    for stream_type, data in stream_map.items():
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
