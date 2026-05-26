"""Tests for the FIT workout exporter."""
import io
import fitdecode
import pytest
from openkoutsi.workout_formats.fit_workout import (
    _flatten_steps,
    FitWorkoutExporter,
)


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


def _decode_steps(data: bytes) -> list[dict]:
    """Return decoded workout_step field dicts from a FIT bytes blob."""
    steps = []
    with fitdecode.FitReader(io.BytesIO(data)) as fit:
        for frame in fit:
            if isinstance(frame, fitdecode.FitDataMessage) and frame.name == "workout_step":
                fields = {f.name: f.value for f in frame.fields}
                steps.append(fields)
    return steps


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

    def test_repeat_steps_back_is_first_child_absolute_index_not_child_count(self):
        # [step(0), repeat_children_start(1), repeat_child(1), REPEAT_marker]
        # steps_back must be 1 (first child absolute index), not 1 (coincidence here)
        # Use a case where they differ: two preceding steps, two children.
        # Flat: [step(0), step(1), child_a(2), child_b(3), REPEAT]
        # steps_back (child count) = 2, first_child_idx = 2 — same here too!
        # Use: [step(0), child_a(1), child_b(2), REPEAT] — preceding=1, children=2.
        # steps_back (child count) = 2, first_child_idx = 1 — different!
        flat = _flatten_steps([_step(), _repeat(3, [_step(), _step()])])
        # flat: [step(0), child_a(1), child_b(2), REPEAT(3)]
        repeat = flat[3]
        assert repeat["_type"] == "repeat"
        assert repeat["steps_back"] == 1  # absolute index of first child, not child count (2)


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
        assert len(result) >= 14

    def test_zone_target_encodes_as_zone_number(self):
        exporter = FitWorkoutExporter()
        step = _step(spec={"type": "zone", "zone_number": 3})
        data = exporter.export([step], "Zone Test", None, 250, None)
        decoded = _decode_steps(data)
        assert decoded[0]["target_type"] == "power"
        assert decoded[0]["target_power_zone"] == 3

    def test_pct_ftp_target_uses_custom_power_fields_as_percentage(self):
        exporter = FitWorkoutExporter()
        step = _step(spec={"type": "pct_ftp", "pct": 100})
        data = exporter.export([step], "Power Test", None, 250, None)
        decoded = _decode_steps(data)
        assert decoded[0]["target_type"] == "power"
        # Stored as percentage directly (no +1000 offset); device uses its own FTP
        assert decoded[0]["custom_target_power_low"] == 100
        assert decoded[0]["custom_target_power_high"] == 100

    def test_pct_ftp_does_not_require_ftp(self):
        exporter = FitWorkoutExporter()
        step = _step(spec={"type": "pct_ftp", "pct": 90})
        data = exporter.export([step], "No FTP", None, None, None)
        decoded = _decode_steps(data)
        assert decoded[0]["target_type"] == "power"
        assert decoded[0]["custom_target_power_low"] == 90
        assert decoded[0]["custom_target_power_high"] == 90

    def test_absolute_power_target_uses_custom_power_fields(self):
        exporter = FitWorkoutExporter()
        step = _step(spec={"type": "absolute", "value": 200})
        data = exporter.export([step], "Absolute Power", None, 250, None)
        decoded = _decode_steps(data)
        assert decoded[0]["target_type"] == "power"
        assert decoded[0]["custom_target_power_low"] == 1200
        assert decoded[0]["custom_target_power_high"] == 1200

    def test_range_power_target_uses_custom_power_fields(self):
        exporter = FitWorkoutExporter()
        step = _step(spec={"type": "range", "low": 200, "high": 250})
        data = exporter.export([step], "Range Power", None, 250, None)
        decoded = _decode_steps(data)
        assert decoded[0]["target_type"] == "power"
        assert decoded[0]["custom_target_power_low"] == 1200
        assert decoded[0]["custom_target_power_high"] == 1250

    def test_intensity_encoded_correctly(self):
        exporter = FitWorkoutExporter()
        steps = [
            _step(step_type="warmup"),
            _step(step_type="active"),
            _step(step_type="cooldown"),
        ]
        data = exporter.export(steps, "Intensity Test", None, 250, None)
        decoded = _decode_steps(data)
        assert decoded[0]["intensity"] == "warmup"
        assert decoded[1]["intensity"] == "active"
        assert decoded[2]["intensity"] == "cooldown"

    def test_export_with_repeat(self):
        exporter = FitWorkoutExporter()
        block = _repeat(4, [
            _step(seconds=60, spec={"type": "pct_ftp", "pct": 120}),
            _step(step_type="recovery", seconds=30),
        ])
        result = exporter.export([block], "Intervals", None, 250, None)
        assert isinstance(result, bytes)

    def test_repeat_count_encoded(self):
        exporter = FitWorkoutExporter()
        block = _repeat(3, [
            _step(seconds=1200, spec={"type": "pct_ftp", "pct": 90}),
            _step(step_type="recovery", seconds=600),
        ])
        data = exporter.export([block], "3x20", None, 250, None)
        decoded = _decode_steps(data)
        repeat_step = next(s for s in decoded if s.get("duration_type") == "repeat_until_steps_cmplt")
        assert repeat_step.get("repeat_steps") == 3
        assert repeat_step.get("duration_step") == 2

    def test_repeat_only_workout_duration_step_is_zero(self):
        # Flat layout: [active(0), recovery(1), REPEAT(2)]
        # The repeat marker must reference step index 0 (where the block starts),
        # not the child-step count (2). Wahoo uses duration_step as an absolute index.
        exporter = FitWorkoutExporter()
        block = _repeat(3, [
            _step(seconds=60, spec={"type": "pct_ftp", "pct": 120}),
            _step(step_type="recovery", seconds=30),
        ])
        data = exporter.export([block], "Intervals", None, 250, None)
        decoded = _decode_steps(data)
        repeat_step = next(s for s in decoded if s.get("duration_type") == "repeat_until_steps_cmplt")
        assert repeat_step["duration_step"] == 0  # first child is at absolute index 0

    def test_repeat_after_warmup_duration_step_is_one(self):
        # Flat layout: [warmup(0), active(1), recovery(2), REPEAT(3)]
        # The repeat marker must reference step index 1 (the active step),
        # not 2 (the child-step count). Offset warmup proves the index is absolute.
        exporter = FitWorkoutExporter()
        steps = [
            _step(step_type="warmup", seconds=600),
            _repeat(5, [
                _step(seconds=120, spec={"type": "pct_ftp", "pct": 110}),
                _step(step_type="recovery", seconds=60),
            ]),
        ]
        data = exporter.export(steps, "Warmup + Intervals", None, 250, None)
        decoded = _decode_steps(data)
        repeat_step = next(s for s in decoded if s.get("duration_type") == "repeat_until_steps_cmplt")
        assert repeat_step["duration_step"] == 1  # first child is at absolute index 1

    def test_full_structured_workout_repeat_encodes_correct_step_index(self):
        # Flat layout: [warmup(0), active(1), recovery(2), REPEAT(3), cooldown(4)]
        # The repeat marker must reference step index 1, not 2.
        exporter = FitWorkoutExporter()
        steps = [
            _step(step_type="warmup", seconds=600),
            _repeat(3, [
                _step(seconds=300, spec={"type": "pct_ftp", "pct": 100}),
                _step(step_type="recovery", seconds=150),
            ]),
            _step(step_type="cooldown", seconds=300),
        ]
        data = exporter.export(steps, "Full Workout", None, 250, None)
        decoded = _decode_steps(data)
        repeat_step = next(s for s in decoded if s.get("duration_type") == "repeat_until_steps_cmplt")
        assert repeat_step["duration_step"] == 1  # first child is at absolute index 1
        assert repeat_step["repeat_steps"] == 3

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

    def test_hr_absolute_target_uses_custom_heart_rate_fields(self):
        # Mirrors the power encoding: custom values must go into custom_target_heart_rate_low/high
        # with a +100 offset (same convention as custom_target_power_low/high uses +1000).
        # Storing bpm+100 in target_value is wrong — devices read target_value as a zone number.
        exporter = FitWorkoutExporter()
        step = {
            "kind": "step", "step_type": "active",
            "duration": {"type": "time", "seconds": 600},
            "target": {"metric": "hr", "spec": {"type": "absolute", "value": 150}},
        }
        data = exporter.export([step], "HR Absolute", None, None, None)
        decoded = _decode_steps(data)
        assert decoded[0]["target_type"] == "heart_rate"
        # custom_target_heart_rate_low/high must carry the BPM+100 encoded value
        assert decoded[0]["custom_target_heart_rate_low"] == 250   # 150 + 100
        assert decoded[0]["custom_target_heart_rate_high"] == 250  # 150 + 100

    def test_export_no_ftp(self):
        exporter = FitWorkoutExporter()
        result = exporter.export([_step()], "No FTP", None, None, None)
        assert isinstance(result, bytes)
