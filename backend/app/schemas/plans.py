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


class TrainingPlanCreate(BaseModel):
    name: str
    start_date: date
    weeks: int = 8
    goal: Optional[str] = None


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

    model_config = {"from_attributes": True}
