import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from openkoutsi.fit import summarizeWorkout, getStartTime, extractIntervals
from backend.app.models.orm import (
    Activity,
    ActivityDistanceBest,
    ActivityInterval,
    ActivityPowerBest,
    ActivityStream,
    Athlete,
)
from backend.app.services.training_math import (
    normalized_power,
    calculate_tss,
    compute_power_bests,
    compute_distance_bests,
)


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


def _auto_interval_s(duration_s: int) -> int:
    minutes = duration_s / 60
    if minutes <= 45:
        return 5 * 60
    elif minutes <= 90:
        return 10 * 60
    else:
        return 15 * 60


def _build_auto_intervals(activity_start: datetime, duration_s: int, interval_s: int) -> list[dict]:
    intervals = []
    offset = 0
    while offset < duration_s:
        length = min(interval_s, duration_s - offset)
        intervals.append({
            "start_time": activity_start + timedelta(seconds=offset),
            "duration_s": float(length),
            "distance_m": None,
        })
        offset += interval_s
    return intervals


def _mean_nonzero(values: list[float]) -> Optional[float]:
    nonzero = [v for v in values if v > 0]
    return sum(nonzero) / len(nonzero) if nonzero else None


def _compute_interval_stats(
    raw: list[dict],
    activity_start: datetime,
    stream_map: dict[str, list[float]],
    is_auto: bool,
) -> list[dict]:
    # Strip tzinfo before subtraction so naive DB datetimes and tz-aware FIT
    # datetimes can be compared without error.
    if activity_start.tzinfo is not None:
        activity_start = activity_start.replace(tzinfo=None)

    result = []
    for i, iv in enumerate(raw):
        iv_start = iv["start_time"]
        if isinstance(iv_start, datetime) and iv_start.tzinfo is not None:
            iv_start = iv_start.replace(tzinfo=None)
        start_offset_s = int(round((iv_start - activity_start).total_seconds()))
        duration_s = int(round(iv["duration_s"]))
        start_offset_s = max(0, start_offset_s)
        end = start_offset_s + duration_s

        def _slice_mean(key: str) -> Optional[float]:
            data = stream_map.get(key, [])
            if not data:
                return None
            return _mean_nonzero(data[start_offset_s:end])

        result.append({
            "interval_number": i + 1,
            "start_offset_s": start_offset_s,
            "duration_s": duration_s,
            "distance_m": iv.get("distance_m"),
            "avg_hr": _slice_mean("heartrate"),
            "avg_power": _slice_mean("power"),
            "avg_speed_ms": _slice_mean("speed"),
            "avg_cadence": _slice_mean("cadence"),
            "is_auto_split": is_auto,
        })
    return result


def read_fit_start_time(path: str) -> Optional[datetime]:
    """
    Extract just the start timestamp from a FIT file without full processing.
    Reads only until the first data record, so it's fast even for large files.
    Returns a UTC-aware datetime, or None if the file contains no timestamps.
    """
    return getStartTime(path)


async def process_fit_file(
    path: str,
    athlete: Athlete,
    activity: Activity,
    session: AsyncSession,
) -> Activity:
    profile = summarizeWorkout(path)

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

    power_data = [float(v) for v in profile.power]
    stream_map = {
        "power": power_data,
        "heartrate": [float(v) for v in profile.heartRate],
        "cadence": [float(v) for v in profile.cadence],
        "speed": [v / 3.6 for v in profile.speed],  # km/h -> m/s
        "altitude": [float(v) for v in profile.altitude],
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

    if power_data:
        bests = compute_power_bests(power_data)
        for duration_s, power_w in bests.items():
            session.add(
                ActivityPowerBest(
                    activity_id=activity.id,
                    athlete_id=athlete.id,
                    duration_s=duration_s,
                    power_w=power_w,
                    activity_start_time=activity.start_time,
                )
            )

    speed_data_ms = stream_map["speed"]  # already converted to m/s above
    if speed_data_ms:
        dbests = compute_distance_bests(speed_data_ms)
        for distance_m, time_s in dbests.items():
            session.add(
                ActivityDistanceBest(
                    activity_id=activity.id,
                    athlete_id=athlete.id,
                    distance_m=distance_m,
                    time_s=time_s,
                    activity_start_time=activity.start_time,
                )
            )

    raw_intervals = extractIntervals(path)
    is_auto = len(raw_intervals) <= 1
    if is_auto:
        interval_s = _auto_interval_s(profile.duration)
        raw_intervals = _build_auto_intervals(profile.start_time, profile.duration, interval_s)

    intervals = _compute_interval_stats(raw_intervals, profile.start_time, stream_map, is_auto)
    for iv in intervals:
        session.add(ActivityInterval(id=str(uuid.uuid4()), activity_id=activity.id, **iv))

    await session.commit()
    await session.refresh(activity)
    return activity
