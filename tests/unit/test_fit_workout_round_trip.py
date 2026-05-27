"""Round-trip and inspection tests for FIT workout export.

Round-trip tests encode a full workout definition, decode the resulting FIT
bytes with fitdecode, and assert every field in the decoded output matches
the input — catching encoding bugs without needing a physical device.

The describe_fit_workout tests verify the human-readable inspection helper
that developers can use instead of uploading to a device.
"""
import io
import fitdecode
import pytest

from openkoutsi.workout_formats.fit_workout import FitWorkoutExporter
from openkoutsi.workout_formats.fit_debug import describe_fit_workout


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _export(steps, name="Test", ftp=250):
    return FitWorkoutExporter().export(steps, name, None, ftp, None)


def _decode(data: bytes) -> list[dict]:
    steps = []
    with fitdecode.FitReader(io.BytesIO(data)) as fit:
        for frame in fit:
            if isinstance(frame, fitdecode.FitDataMessage) and frame.name == "workout_step":
                steps.append({f.name: f.value for f in frame.fields})
    return steps


# ---------------------------------------------------------------------------
# Round-trip tests
# ---------------------------------------------------------------------------

class TestRoundTrip:
    def test_warmup_intervals_cooldown(self):
        """Full structured workout: warmup + 5x(active+recovery) + cooldown."""
        steps = [
            {"kind": "step", "step_type": "warmup",
             "duration": {"type": "time", "seconds": 600}},
            {"kind": "repeat", "repeat_count": 5, "steps": [
                {"kind": "step", "step_type": "active",
                 "duration": {"type": "time", "seconds": 120},
                 "target": {"metric": "power", "spec": {"type": "pct_ftp", "pct": 100}}},
                {"kind": "step", "step_type": "recovery",
                 "duration": {"type": "time", "seconds": 60}},
            ]},
            {"kind": "step", "step_type": "cooldown",
             "duration": {"type": "time", "seconds": 600}},
        ]
        decoded = _decode(_export(steps, "5x2min"))

        # Flat layout: warmup(0), active(1), recovery(2), REPEAT(3), cooldown(4)
        assert len(decoded) == 5

        warmup, active, recovery, repeat, cooldown = decoded

        assert warmup["intensity"] == "warmup"
        assert warmup["duration_type"] == "time"
        assert warmup["duration_value"] == 600_000

        assert active["intensity"] == "active"
        assert active["duration_type"] == "time"
        assert active["duration_value"] == 120_000
        assert active["target_type"] == "power"
        assert active["custom_target_power_low"] == 100
        assert active["custom_target_power_high"] == 100

        assert recovery["intensity"] == "recovery"
        assert recovery["duration_value"] == 60_000

        assert repeat["duration_type"] == "repeat_until_steps_cmplt"
        assert repeat["duration_step"] == 1   # first child (active) is at absolute index 1
        assert repeat["repeat_steps"] == 5

        assert cooldown["intensity"] == "cooldown"
        assert cooldown["duration_value"] == 600_000

    def test_repeat_only(self):
        """Repeat block with no preceding steps — first child is at index 0."""
        steps = [
            {"kind": "repeat", "repeat_count": 3, "steps": [
                {"kind": "step", "step_type": "active",
                 "duration": {"type": "time", "seconds": 300},
                 "target": {"metric": "power", "spec": {"type": "zone", "zone_number": 4}}},
                {"kind": "step", "step_type": "recovery",
                 "duration": {"type": "time", "seconds": 120}},
            ]},
        ]
        decoded = _decode(_export(steps, "3x5min"))

        assert len(decoded) == 3
        assert decoded[0]["intensity"] == "active"
        assert decoded[0]["target_type"] == "power"
        assert decoded[0]["target_power_zone"] == 4

        repeat = decoded[2]
        assert repeat["duration_type"] == "repeat_until_steps_cmplt"
        assert repeat["duration_step"] == 0
        assert repeat["repeat_steps"] == 3

    def test_multiple_repeat_blocks(self):
        """Two back-to-back repeat blocks — second block's marker must reference correct index."""
        steps = [
            {"kind": "step", "step_type": "warmup",
             "duration": {"type": "time", "seconds": 300}},
            {"kind": "repeat", "repeat_count": 3, "steps": [
                {"kind": "step", "step_type": "active",
                 "duration": {"type": "time", "seconds": 60},
                 "target": {"metric": "power", "spec": {"type": "pct_ftp", "pct": 120}}},
                {"kind": "step", "step_type": "recovery",
                 "duration": {"type": "time", "seconds": 30}},
            ]},
            {"kind": "repeat", "repeat_count": 2, "steps": [
                {"kind": "step", "step_type": "active",
                 "duration": {"type": "time", "seconds": 300},
                 "target": {"metric": "power", "spec": {"type": "pct_ftp", "pct": 90}}},
                {"kind": "step", "step_type": "recovery",
                 "duration": {"type": "time", "seconds": 120}},
            ]},
            {"kind": "step", "step_type": "cooldown",
             "duration": {"type": "time", "seconds": 300}},
        ]
        decoded = _decode(_export(steps, "Mixed"))

        # Flat: warmup(0), active1(1), rec1(2), REPEAT1(3), active2(4), rec2(5), REPEAT2(6), cooldown(7)
        assert len(decoded) == 8

        repeat1 = decoded[3]
        assert repeat1["duration_type"] == "repeat_until_steps_cmplt"
        assert repeat1["duration_step"] == 1
        assert repeat1["repeat_steps"] == 3

        repeat2 = decoded[6]
        assert repeat2["duration_type"] == "repeat_until_steps_cmplt"
        assert repeat2["duration_step"] == 4
        assert repeat2["repeat_steps"] == 2

    def test_hr_absolute_target_round_trip(self):
        """HR absolute targets encode into custom_target_heart_rate_low/high, not target_value."""
        steps = [
            {"kind": "step", "step_type": "active",
             "duration": {"type": "time", "seconds": 1800},
             "target": {"metric": "hr", "spec": {"type": "absolute", "value": 155}}},
        ]
        decoded = _decode(_export(steps, "HR Zone"))
        assert decoded[0]["target_type"] == "heart_rate"
        assert decoded[0]["custom_target_heart_rate_low"] == 255   # 155 + 100
        assert decoded[0]["custom_target_heart_rate_high"] == 255

    def test_distance_duration_round_trip(self):
        steps = [
            {"kind": "step", "step_type": "active",
             "duration": {"type": "distance", "meters": 1000}},
        ]
        decoded = _decode(_export(steps, "1km"))
        assert decoded[0]["duration_type"] == "distance"
        assert decoded[0]["duration_value"] == 100_000  # 1000 m × 100 cm/m

    def test_absolute_power_round_trip(self):
        steps = [
            {"kind": "step", "step_type": "active",
             "duration": {"type": "time", "seconds": 600},
             "target": {"metric": "power", "spec": {"type": "absolute", "value": 250}}},
        ]
        decoded = _decode(_export(steps, "Absolute"))
        assert decoded[0]["custom_target_power_low"] == 1250   # 250 + 1000
        assert decoded[0]["custom_target_power_high"] == 1250

    def test_range_power_round_trip(self):
        steps = [
            {"kind": "step", "step_type": "active",
             "duration": {"type": "time", "seconds": 600},
             "target": {"metric": "power", "spec": {"type": "range", "low": 200, "high": 250}}},
        ]
        decoded = _decode(_export(steps, "Range"))
        assert decoded[0]["custom_target_power_low"] == 1200
        assert decoded[0]["custom_target_power_high"] == 1250

    def test_nested_repeat_round_trip(self):
        """Nested repeat: inner marker must point to the correct absolute step index."""
        steps = [
            {"kind": "step", "step_type": "warmup",
             "duration": {"type": "time", "seconds": 300}},
            {"kind": "repeat", "repeat_count": 3, "steps": [
                {"kind": "repeat", "repeat_count": 2, "steps": [
                    {"kind": "step", "step_type": "active",
                     "duration": {"type": "time", "seconds": 60}},
                ]},
            ]},
        ]
        decoded = _decode(_export(steps, "Nested"))

        # Flat: warmup(0), active(1), INNER_REPEAT(2), OUTER_REPEAT(3)
        assert len(decoded) == 4

        inner_repeat = decoded[2]
        assert inner_repeat["duration_type"] == "repeat_until_steps_cmplt"
        assert inner_repeat["duration_step"] == 1   # active is at absolute index 1
        assert inner_repeat["repeat_steps"] == 2

        outer_repeat = decoded[3]
        assert outer_repeat["duration_type"] == "repeat_until_steps_cmplt"
        assert outer_repeat["duration_step"] == 1   # outer block also starts at active (index 1)
        assert outer_repeat["repeat_steps"] == 3


# ---------------------------------------------------------------------------
# describe_fit_workout tests
# ---------------------------------------------------------------------------

class TestDescribeFitWorkout:
    def test_contains_workout_name(self):
        steps = [{"kind": "step", "step_type": "active",
                  "duration": {"type": "time", "seconds": 300}}]
        output = describe_fit_workout(_export(steps, "My Workout"))
        assert "My Workout" in output

    def test_shows_step_count(self):
        steps = [
            {"kind": "step", "step_type": "warmup", "duration": {"type": "time", "seconds": 300}},
            {"kind": "step", "step_type": "active", "duration": {"type": "time", "seconds": 600}},
        ]
        output = describe_fit_workout(_export(steps, "W"))
        assert "2 steps" in output

    def test_repeat_marker_shows_target_step_and_count(self):
        """The description must make the repeat target index and count immediately visible."""
        steps = [
            {"kind": "step", "step_type": "warmup", "duration": {"type": "time", "seconds": 300}},
            {"kind": "repeat", "repeat_count": 4, "steps": [
                {"kind": "step", "step_type": "active",
                 "duration": {"type": "time", "seconds": 60}},
                {"kind": "step", "step_type": "recovery",
                 "duration": {"type": "time", "seconds": 30}},
            ]},
        ]
        output = describe_fit_workout(_export(steps, "Intervals"))
        # Repeat marker should reference step 1 (active) and repeat 4 times
        assert "→1" in output
        assert "×4" in output

    def test_power_pct_ftp_shown_in_description(self):
        steps = [{"kind": "step", "step_type": "active",
                  "duration": {"type": "time", "seconds": 300},
                  "target": {"metric": "power", "spec": {"type": "pct_ftp", "pct": 105}}}]
        output = describe_fit_workout(_export(steps, "W"))
        assert "105" in output
        assert "FTP" in output

    def test_duration_formatted_as_time(self):
        steps = [{"kind": "step", "step_type": "active",
                  "duration": {"type": "time", "seconds": 3661}}]  # 1h 1m 1s
        output = describe_fit_workout(_export(steps, "W"))
        assert "01:01:01" in output

    def test_returns_string(self):
        steps = [{"kind": "step", "step_type": "active",
                  "duration": {"type": "time", "seconds": 60}}]
        assert isinstance(describe_fit_workout(_export(steps, "W")), str)
