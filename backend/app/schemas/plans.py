from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class PlannedWorkoutResponse(BaseModel):
    id: str
    plan_id: str
    week_number: int
    day_of_week: int
    workout_type: str
    description: Optional[str] = None
    duration_min: Optional[int] = None
    target_tss: Optional[int] = None
    completed_activity_id: Optional[str] = None

    model_config = {"from_attributes": True}


class DayConfig(BaseModel):
    day_of_week: int  # 1=Mon … 7=Sun
    workout_type: str  # "threshold", "easy", "long", "strength", "yoga", …
    notes: Optional[str] = None


class PlanConfig(BaseModel):
    days_per_week: int
    day_configs: list[DayConfig]
    periodization: str = "base_building"  # "base_building" | "race_prep" | "maintenance"
    intensity_preference: str = "moderate"  # "low" | "moderate" | "high"
    long_description: Optional[str] = None  # free-text for LLM


class TrainingPlanCreate(BaseModel):
    name: str
    start_date: date
    weeks: int = 8
    goal: Optional[str] = None
    config: Optional[PlanConfig] = None
    use_llm: bool = False


class TrainingPlanUpdate(BaseModel):
    status: Optional[str] = None
    name: Optional[str] = None


class TrainingPlanResponse(BaseModel):
    id: str
    athlete_id: str
    name: str
    start_date: date
    end_date: Optional[date] = None
    goal: Optional[str] = None
    weeks: Optional[int] = None
    status: str
    created_at: datetime
    workouts: list[PlannedWorkoutResponse] = []
    config: Optional[dict] = None
    generation_method: Optional[str] = None

    model_config = {"from_attributes": True}
