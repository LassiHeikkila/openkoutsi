from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ManualActivityCreate(BaseModel):
    sport_type: str
    start_time: datetime
    duration_s: int = Field(..., gt=0)
    name: Optional[str] = None
    # TSS resolution (in priority order): explicit tss > rpe > avg_hr
    tss: Optional[float] = Field(None, ge=0)
    rpe: Optional[int] = Field(None, ge=1, le=10)
    avg_hr: Optional[float] = Field(None, gt=0)
    distance_m: Optional[float] = None
    elevation_m: Optional[float] = None


class ActivityResponse(BaseModel):
    id: str
    athlete_id: str
    strava_id: Optional[str] = None
    source: str
    name: Optional[str] = None
    sport_type: Optional[str] = None
    start_time: Optional[datetime] = None
    duration_s: Optional[int] = None
    distance_m: Optional[float] = None
    elevation_m: Optional[float] = None
    avg_power: Optional[float] = None
    normalized_power: Optional[float] = None
    avg_hr: Optional[float] = None
    max_hr: Optional[float] = None
    tss: Optional[float] = None
    intensity_factor: Optional[float] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityListResponse(BaseModel):
    items: list[ActivityResponse]
    total: int
    page: int
    page_size: int


class ActivityDetailResponse(ActivityResponse):
    streams: dict[str, list[Any]] = {}

    @classmethod
    def from_orm_and_streams(
        cls, activity, streams: dict[str, list]
    ) -> "ActivityDetailResponse":
        return cls(
            id=activity.id,
            athlete_id=activity.athlete_id,
            strava_id=activity.strava_id,
            source=activity.source,
            name=activity.name,
            sport_type=activity.sport_type,
            start_time=activity.start_time,
            duration_s=activity.duration_s,
            distance_m=activity.distance_m,
            elevation_m=activity.elevation_m,
            avg_power=activity.avg_power,
            normalized_power=activity.normalized_power,
            avg_hr=activity.avg_hr,
            max_hr=activity.max_hr,
            tss=activity.tss,
            intensity_factor=activity.intensity_factor,
            status=activity.status,
            created_at=activity.created_at,
            streams=streams,
        )
