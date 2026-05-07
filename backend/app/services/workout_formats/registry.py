from backend.app.services.workout_formats.base import AbstractWorkoutExporter
from backend.app.services.workout_formats.zwift import ZwiftExporter
from backend.app.services.workout_formats.fit_workout import FitWorkoutExporter
from backend.app.services.workout_formats.json_export import JsonExporter

EXPORTERS: dict[str, type[AbstractWorkoutExporter]] = {
    "zwift": ZwiftExporter,
    "fit_workout": FitWorkoutExporter,
    "json": JsonExporter,
}
