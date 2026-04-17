from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PowerBestEntry(BaseModel):
    duration_s: int
    rank: int
    power_w: float
    activity_id: str
    activity_name: Optional[str]
    activity_start_time: Optional[datetime]


class AllTimePowerBestsResponse(BaseModel):
    bests: list[PowerBestEntry]
