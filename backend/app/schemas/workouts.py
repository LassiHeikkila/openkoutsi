from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field


class TimeDuration(BaseModel):
    type: Literal["time"]
    seconds: int = Field(gt=0)


class DistanceDuration(BaseModel):
    type: Literal["distance"]
    meters: int = Field(gt=0)


class OpenDuration(BaseModel):
    type: Literal["open"]


Duration = Annotated[
    Union[TimeDuration, DistanceDuration, OpenDuration],
    Field(discriminator="type"),
]


class ZoneSpec(BaseModel):
    type: Literal["zone"]
    zone_number: int = Field(ge=1)


class PctFtpSpec(BaseModel):
    type: Literal["pct_ftp"]
    pct: float = Field(gt=0)


class AbsoluteSpec(BaseModel):
    type: Literal["absolute"]
    value: float = Field(gt=0)


class RangeSpec(BaseModel):
    type: Literal["range"]
    low: float
    high: float


TargetSpec = Annotated[
    Union[ZoneSpec, PctFtpSpec, AbsoluteSpec, RangeSpec],
    Field(discriminator="type"),
]


class WorkoutTarget(BaseModel):
    metric: Literal["power", "hr", "cadence", "pace"]
    spec: TargetSpec


class WorkoutStep(BaseModel):
    kind: Literal["step"]
    step_type: Literal["warmup", "active", "recovery", "cooldown", "rest", "other"]
    duration: Duration
    target: Optional[WorkoutTarget] = None
    notes: Optional[str] = None


class RepeatBlock(BaseModel):
    kind: Literal["repeat"]
    repeat_count: int = Field(ge=2)
    steps: list[WorkoutStepOrRepeat] = Field(min_length=1)

    def max_depth(self) -> int:
        depths = []
        for s in self.steps:
            if isinstance(s, RepeatBlock):
                depths.append(1 + s.max_depth())
            else:
                depths.append(0)
        return max(depths) if depths else 0


WorkoutStepOrRepeat = Annotated[
    Union[WorkoutStep, RepeatBlock],
    Field(discriminator="kind"),
]

RepeatBlock.model_rebuild()


class WorkoutDefinitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    sport_type: str = "Ride"
    steps: list[WorkoutStepOrRepeat] = Field(default_factory=list)


class WorkoutDefinitionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    sport_type: Optional[str] = None
    steps: Optional[list[WorkoutStepOrRepeat]] = None


class WorkoutDefinitionResponse(BaseModel):
    id: str
    athlete_id: str
    name: str
    description: Optional[str] = None
    sport_type: str
    steps: list[dict]
    estimated_duration_s: Optional[int] = None
    estimated_tss: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExportFormatInfo(BaseModel):
    key: str
    label: str
    file_extension: str
    mime_type: str
