"""
Shared training load calculations used by both the FIT processor and Strava sync.
"""

POWER_BEST_DURATIONS: list[int] = [
    1, 3, 5, 10, 15, 30, 45, 60, 120, 180, 300, 480,
    900, 1200, 1800, 2700, 3600, 7200, 10800, 14400,
    18000, 21600, 25200, 28800,
]


def peak_average_power(stream: list[float], duration_s: int) -> float | None:
    """
    Return the highest mean wattage over any contiguous `duration_s`-second
    window in `stream`.  Returns None if the stream is shorter than the window.
    Uses a sliding-window approach so it is O(n) per duration.
    """
    n = len(stream)
    if n < duration_s:
        return None
    window_sum = sum(stream[:duration_s])
    best = window_sum
    for i in range(duration_s, n):
        window_sum += stream[i] - stream[i - duration_s]
        if window_sum > best:
            best = window_sum
    return best / duration_s


def compute_power_bests(stream: list[float]) -> dict[int, float]:
    """
    Compute peak_average_power for every standard duration in POWER_BEST_DURATIONS.
    Only returns entries where the stream is long enough to cover the duration.
    """
    return {
        d: v
        for d in POWER_BEST_DURATIONS
        if (v := peak_average_power(stream, d)) is not None
    }


# Distance best durations in metres
DISTANCE_BEST_DISTANCES: list[int] = [
    1_000, 2_000, 3_000, 5_000, 8_000,
    10_000, 20_000, 30_000, 40_000, 50_000,
    60_000, 70_000, 80_000, 90_000, 100_000,
    110_000, 120_000, 130_000, 140_000, 150_000,
]


def best_time_for_distance(speed_stream: list[float], distance_m: int) -> int | None:
    """
    Return the minimum number of seconds to cover `distance_m` metres in
    `speed_stream` (m/s values at 1-second intervals).

    Uses a two-pointer sliding-window approach: O(n).
    Returns None if the total distance in the stream is less than distance_m.
    """
    n = len(speed_stream)
    if n == 0:
        return None

    # prefix sums of distance (metres)
    cum = [0.0] * (n + 1)
    for i, v in enumerate(speed_stream):
        cum[i + 1] = cum[i] + v

    if cum[n] < distance_m:
        return None

    best = n + 1  # larger than any valid window
    j = 0
    for i in range(1, n + 1):
        while cum[i] - cum[j] >= distance_m:
            best = min(best, i - j)
            j += 1

    return best if best <= n else None


def compute_distance_bests(speed_stream: list[float]) -> dict[int, int]:
    """
    Compute best_time_for_distance for every standard distance.
    Only returns entries where the stream covers that distance.
    """
    return {
        d: t
        for d in DISTANCE_BEST_DISTANCES
        if (t := best_time_for_distance(speed_stream, d)) is not None
    }


def normalized_power(power_series: list[float]) -> float | None:
    """30-second rolling average → raise to 4th power → mean → 4th root."""
    if len(power_series) < 30:
        return None
    window = 30
    rolling = [
        sum(power_series[i - window + 1 : i + 1]) / window
        for i in range(window - 1, len(power_series))
    ]
    if not rolling:
        return None
    return (sum(v**4 for v in rolling) / len(rolling)) ** 0.25


def calculate_tss(
    duration_s: int,
    np: float | None,
    avg_hr: float | None,
    ftp: int | None,
    max_hr: int | None,
) -> tuple[float | None, float | None]:
    """
    Returns (tss, intensity_factor).

    Priority: power-based TSS if NP and FTP are available, otherwise
    HR-based TRIMP TSS if avg_hr and max_hr are available.
    """
    if np is not None and ftp:
        intensity_factor = np / ftp
        tss = (duration_s * np * intensity_factor) / (ftp * 3600) * 100
        return tss, intensity_factor

    if avg_hr is not None and max_hr:
        lthr = 0.9 * max_hr
        if lthr == 0:
            return None, None
        trimp_weight = 1.92
        tss = (duration_s * avg_hr * trimp_weight) / (lthr * 3600) * 100
        return tss, None

    return None, None
