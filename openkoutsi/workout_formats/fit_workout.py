"""Export workout definitions to FIT workout format (.fit).

Compatible with Wahoo ELEMNT, Garmin cycling computers, and most ANT+ devices.
Requires the `fit-tool` package (add to pyproject.toml and run `uv sync`).
"""

from __future__ import annotations

from openkoutsi.workout_formats.base import AbstractWorkoutExporter, ExporterMeta

try:
    from fit_tool.fit_file_builder import FitFileBuilder
    from fit_tool.profile.messages.file_id_message import FileIdMessage
    from fit_tool.profile.messages.workout_message import WorkoutMessage
    from fit_tool.profile.messages.workout_step_message import WorkoutStepMessage
    from fit_tool.profile.profile_type import (
        FileType,
        Sport,
        Intensity,
        WorkoutStepDuration,
        WorkoutStepTarget,
    )

    _FIT_AVAILABLE = True
except ImportError:
    _FIT_AVAILABLE = False


_INTENSITY = {
    "warmup": "WARMUP",
    "active": "ACTIVE",
    "recovery": "RECOVERY",
    "cooldown": "COOLDOWN",
    "rest": "REST",
    "other": "ACTIVE",
}


def _flatten_steps(steps: list[dict]) -> list[dict]:
    """
    Linearise the step tree into a flat list suitable for FIT message encoding.

    RepeatBlock is encoded as a special step with duration_type=REPEAT_UNTIL_STEPS_CMPLT,
    pointing back to the first child step. The repeat step is inserted AFTER the child steps
    (that is how FIT repeat steps work — they are a "loop back" marker).
    """
    result: list[dict] = []

    for step in steps:
        kind = step.get("kind")
        if kind == "step":
            result.append({"_type": "step", **step})
        elif kind == "repeat":
            children = step.get("steps", [])
            first_child_idx = len(result)
            result.extend(_flatten_steps(children))
            last_child_idx = len(result) - 1
            step_count = last_child_idx - first_child_idx + 1
            result.append({
                "_type": "repeat",
                "repeat_count": step.get("repeat_count", 1),
                "steps_back": step_count,
            })

    return result


def _build_fit_bytes(
    flat_steps: list[dict],
    workout_name: str,
) -> bytes:
    builder = FitFileBuilder()

    file_id = FileIdMessage()
    file_id.type = FileType.WORKOUT
    builder.add(file_id)

    workout_msg = WorkoutMessage()
    workout_msg.sport = Sport.CYCLING
    workout_msg.num_valid_steps = len(flat_steps)
    workout_msg.workout_name = workout_name
    builder.add(workout_msg)

    for step in flat_steps:
        msg = WorkoutStepMessage()

        if step["_type"] == "repeat":
            msg.duration_type = WorkoutStepDuration.REPEAT_UNTIL_STEPS_CMPLT
            msg.duration_value = step["steps_back"]
            msg.target_type = WorkoutStepTarget.OPEN
            msg.target_value = step["repeat_count"]
            msg.intensity = Intensity.ACTIVE
            builder.add(msg)
            continue

        dur = step.get("duration", {})
        if dur.get("type") == "time":
            msg.duration_type = WorkoutStepDuration.TIME
            msg.duration_value = dur["seconds"] * 1000  # FIT stores milliseconds
        elif dur.get("type") == "distance":
            msg.duration_type = WorkoutStepDuration.DISTANCE
            msg.duration_value = dur["meters"] * 100  # FIT stores centimetres
        else:
            msg.duration_type = WorkoutStepDuration.OPEN
            msg.duration_value = 0

        target = step.get("target")
        if target and target.get("metric") == "power":
            spec = target.get("spec", {})
            spec_type = spec.get("type")
            msg.target_type = WorkoutStepTarget.POWER
            if spec_type == "zone":
                # Zone number (1-7) goes in target_power_zone; device shows the zone label
                msg.target_power_zone = spec["zone_number"]
            elif spec_type == "pct_ftp":
                # Store percentage directly (no +1000 offset); values <1000 are unambiguous
                # since absolute watts always use the watts+1000 convention (>=1001).
                pct = int(spec["pct"])
                msg.custom_target_power_low = pct
                msg.custom_target_power_high = pct
            elif spec_type == "absolute":
                watts = int(spec["value"])
                msg.custom_target_power_low = watts + 1000
                msg.custom_target_power_high = watts + 1000
            elif spec_type == "range":
                msg.custom_target_power_low = int(spec["low"]) + 1000
                msg.custom_target_power_high = int(spec["high"]) + 1000
            else:
                msg.target_type = WorkoutStepTarget.OPEN
        elif target and target.get("metric") == "hr":
            msg.target_type = WorkoutStepTarget.HEART_RATE
            spec = target["spec"]
            if spec.get("type") == "absolute":
                msg.target_value = int(spec["value"]) + 100  # FIT HR offset
        else:
            msg.target_type = WorkoutStepTarget.OPEN

        step_type = step.get("step_type", "active")
        intensity_name = _INTENSITY.get(step_type, "ACTIVE")
        msg.intensity = getattr(Intensity, intensity_name, Intensity.ACTIVE)

        if step.get("notes"):
            msg.notes = step["notes"][:50]

        builder.add(msg)

    fit_file = builder.build()
    return fit_file.to_bytes()


class FitWorkoutExporter(AbstractWorkoutExporter):
    meta = ExporterMeta(
        key="fit_workout",
        label="FIT Workout (.fit) — Wahoo ELEMNT, Garmin",
        file_extension="fit",
        mime_type="application/octet-stream",
    )

    def export(
        self,
        steps: list[dict],
        workout_name: str,
        workout_description: str | None,
        athlete_ftp: int | None,
        athlete_power_zones: list[dict] | None,
    ) -> bytes:
        if not _FIT_AVAILABLE:
            raise RuntimeError(
                "fit-tool is not installed. Add 'fit-tool>=0.9' to pyproject.toml and run 'uv sync'."
            )

        flat = _flatten_steps(steps)
        return _build_fit_bytes(flat, workout_name)
