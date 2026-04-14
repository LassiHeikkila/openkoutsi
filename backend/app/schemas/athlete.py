from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class ZoneSchema(BaseModel):
    low: int
    high: int
    name: str


class FtpTestSchema(BaseModel):
    date: str
    ftp: int
    method: str = "test"


class AthleteResponse(BaseModel):
    id: str
    user_id: str
    name: Optional[str] = None
    date_of_birth: Optional[date] = None
    weight_kg: Optional[float] = None
    ftp: Optional[int] = None
    max_hr: Optional[int] = None
    resting_hr: Optional[int] = None
    hr_zones: list[ZoneSchema] = []
    power_zones: list[ZoneSchema] = []
    ftp_tests: list[FtpTestSchema] = []
    strava_connected: bool = False
    app_settings: dict = {}
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("hr_zones", "power_zones", "ftp_tests", mode="before")
    @classmethod
    def coerce_none_to_list(cls, v):
        return v if v is not None else []

    @field_validator("app_settings", mode="before")
    @classmethod
    def coerce_app_settings(cls, v):
        return v if isinstance(v, dict) else {}

    @field_validator("strava_connected", mode="before")
    @classmethod
    def derive_strava_connected(cls, v, info):
        # v is actually the field value; we need to check strava_athlete_id from the model
        # This validator receives the raw value — the ORM has no strava_connected column,
        # so we compute it in the endpoint instead. Accept bool passthrough.
        return bool(v)


class AthleteUpdate(BaseModel):
    name: Optional[str] = None
    date_of_birth: Optional[date] = None
    weight_kg: Optional[float] = None
    ftp: Optional[int] = None
    max_hr: Optional[int] = None
    resting_hr: Optional[int] = None
    hr_zones: Optional[list[ZoneSchema]] = None
    power_zones: Optional[list[ZoneSchema]] = None
    app_settings: Optional[dict] = None
