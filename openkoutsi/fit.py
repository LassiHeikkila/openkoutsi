from datetime import datetime

import fitdecode

from . import workout


def summarizeWorkout(fr) -> workout.Profile:
    first_ts: datetime | None = None
    last_ts = None
    duration_from_session = None
    distance_from_session = 0
    elevation_gain_from_session = 0
    sport_from_file: str | None = None

    heart_rate: list[int] = []
    speed: list[float] = []
    power: list[int] = []
    cadence: list[int] = []

    for frame in fr:
        if frame.frame_type != fitdecode.FIT_FRAME_DATA:
            continue

        if frame.name == "sport":
            s = frame.get_value("sport", fallback=None)
            if s is not None:
                sport_from_file = str(s)

        elif frame.name == "session":
            total_timer = frame.get_value("total_timer_time", fallback=None)
            if total_timer is not None:
                duration_from_session = int(total_timer)

            total_distance = frame.get_value("total_distance", fallback=None)
            if total_distance is not None:
                distance_from_session = int(total_distance)

            total_ascent = frame.get_value("total_ascent", fallback=None)
            if total_ascent is not None:
                elevation_gain_from_session = int(total_ascent)

        elif frame.name == "record":
            ts = frame.get_value("timestamp", fallback=None)
            if ts is not None:
                if first_ts is None:
                    first_ts = ts
                last_ts = ts

            hr = frame.get_value("heart_rate", fallback=None)
            if hr is not None:
                heart_rate.append(int(hr))

            spd = frame.get_value("speed", fallback=None)
            if spd is not None:
                speed.append(float(spd) * 3.6)  # m/s -> km/h

            pwr = frame.get_value("power", fallback=None)
            if pwr is not None:
                power.append(int(pwr))

            cad = frame.get_value("cadence", fallback=None)
            if cad is not None:
                cadence.append(int(cad))

    if duration_from_session is not None:
        duration = duration_from_session
    elif first_ts is not None and last_ts is not None:
        if hasattr(last_ts - first_ts, "total_seconds"):
            duration = int((last_ts - first_ts).total_seconds())
        else:
            duration = int(last_ts - first_ts)
    else:
        duration = 0

    return workout.Profile(
        start_time=first_ts or datetime.fromtimestamp(0),
        duration=duration,
        distance=distance_from_session,
        elevationGain=elevation_gain_from_session,
        heartRate=heart_rate,
        speed=speed,
        power=power,
        cadence=cadence,
        sport_type=sport_from_file,
    )
