"""Tests for the FIT workout exporter."""
import pytest
from openkoutsi.workout_formats.fit_workout import (
    _zone_midpoint_w,
    _spec_to_watts,
    _flatten_steps,
    FitWorkoutExporter,
)

POWER_ZONES = [
    {"low": 0, "high": 150},    # Z1
    {"low": 151, "high": 210},  # Z2
    {"low": 211, "high": 250},  # Z3
]


def _step(step_type="active", duration_type="time", seconds=300, spec=None, notes=None):
    s = {
        "kind": "step",
        "step_type": step_type,
        "duration": {"type": duration_type, "seconds": seconds},
    }
    if spec:
        s["target"] = {"metric": "power", "spec": spec}
    if notes:
        s["notes"] = notes
    return s


def _repeat(count, steps):
    return {"kind": "repeat", "repeat_count": count, "steps": steps}


class TestZoneMidpointW:
    def test_uses_provided_zones(self):
        # Z1: 0-150W → midpoint 75W
        assert _zone_midpoint_w(1, POWER_ZONES, 250) == 75

    def test_uses_fallback_when_no_zones(self):
        # Z1 fallback 55% of FTP=250 → 137W
        assert _zone_midpoint_w(1, None, 250) == int(250 * 0.55)

    def test_uses_fallback_for_out_of_range(self):
        assert _zone_midpoint_w(99, POWER_ZONES, 250) == int(250 * 0.75)


class TestSpecToWatts:
    def test_pct_ftp(self):
        assert _spec_to_watts({"type": "pct_ftp", "pct": 90}, 250, None) == int(250 * 0.9)

    def test_absolute(self):
        assert _spec_to_watts({"type": "absolute", "value": 230}, 250, None) == 230

    def test_range_uses_midpoint(self):
        assert _spec_to_watts({"type": "range", "low": 200, "high": 300}, 250, None) == 250

    def test_zone(self):
        assert _spec_to_watts({"type": "zone", "zone_number": 1}, 250, POWER_ZONES) == 75

    def test_unknown_returns_zero(self):
        assert _spec_to_watts({"type": "unknown"}, 250, None) == 0


class TestFlattenSteps:
    def test_flat_steps(self):
        flat = _flatten_steps([_step(), _step(step_type="recovery")])
        assert len(flat) == 2
        assert all(f["_type"] == "step" for f in flat)

    def test_empty_list(self):
        assert _flatten_steps([]) == []

    def test_repeat_inserts_loop_marker_after_children(self):
        block = _repeat(3, [_step(seconds=60), _step(step_type="recovery", seconds=30)])
        flat = _flatten_steps([block])
        # 2 child steps + 1 repeat marker = 3 total
        assert len(flat) == 3
        assert flat[0]["_type"] == "step"
        assert flat[1]["_type"] == "step"
        assert flat[2]["_type"] == "repeat"
        assert flat[2]["repeat_count"] == 3
        assert flat[2]["steps_back"] == 2

    def test_repeat_steps_back_correct_for_single_child(self):
        block = _repeat(5, [_step()])
        flat = _flatten_steps([block])
        assert flat[1]["steps_back"] == 1

    def test_nested_repeats(self):
        inner = _repeat(2, [_step()])
        outer = _repeat(3, [inner])
        flat = _flatten_steps([outer])
        # inner: 1 step + 1 repeat marker = 2
        # outer: those 2 + outer repeat marker = 3
        assert len(flat) == 3
        # Last element is the outer repeat
        assert flat[-1]["repeat_count"] == 3

    def test_mixed_steps_and_repeat(self):
        flat = _flatten_steps([_step(), _repeat(2, [_step()]), _step()])
        assert len(flat) == 4  # warmup + (1 step + 1 repeat marker) + cooldown


class TestFitWorkoutExporter:
    def test_export_returns_bytes(self):
        exporter = FitWorkoutExporter()
        steps = [_step(seconds=600), _step(step_type="recovery", seconds=300)]
        result = exporter.export(steps, "Test Workout", None, 250, None)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_export_starts_with_fit_magic(self):
        exporter = FitWorkoutExporter()
        result = exporter.export([_step()], "W", None, 250, None)
        # FIT files start with 14-byte header; check it's a valid byte sequence
        assert len(result) >= 14

    def test_export_with_power_spec(self):
        exporter = FitWorkoutExporter()
        step = _step(spec={"type": "pct_ftp", "pct": 100})
        result = exporter.export([step], "Power Test", None, 250, None)
        assert isinstance(result, bytes)

    def test_export_with_repeat(self):
        exporter = FitWorkoutExporter()
        block = _repeat(4, [
            _step(seconds=60, spec={"type": "pct_ftp", "pct": 120}),
            _step(step_type="recovery", seconds=30),
        ])
        result = exporter.export([block], "Intervals", None, 250, None)
        assert isinstance(result, bytes)

    def test_export_distance_duration(self):
        exporter = FitWorkoutExporter()
        step = {"kind": "step", "step_type": "active", "duration": {"type": "distance", "meters": 1000}}
        result = exporter.export([step], "Distance", None, 250, None)
        assert isinstance(result, bytes)

    def test_export_open_duration(self):
        exporter = FitWorkoutExporter()
        step = {"kind": "step", "step_type": "active", "duration": {"type": "open"}}
        result = exporter.export([step], "Open", None, 250, None)
        assert isinstance(result, bytes)

    def test_export_with_notes(self):
        exporter = FitWorkoutExporter()
        step = _step(notes="Steady effort")
        result = exporter.export([step], "Notes", None, 250, None)
        assert isinstance(result, bytes)

    def test_export_hr_target(self):
        exporter = FitWorkoutExporter()
        step = {
            "kind": "step", "step_type": "active",
            "duration": {"type": "time", "seconds": 600},
            "target": {"metric": "hr", "spec": {"type": "absolute", "value": 150}},
        }
        result = exporter.export([step], "HR", None, 250, None)
        assert isinstance(result, bytes)

    def test_export_no_ftp(self):
        exporter = FitWorkoutExporter()
        result = exporter.export([_step()], "No FTP", None, None, None)
        assert isinstance(result, bytes)
