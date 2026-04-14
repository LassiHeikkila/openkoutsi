import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.encryption import EncryptedString
from backend.app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    athlete: Mapped[Optional["Athlete"]] = relationship(
        "Athlete", back_populates="user", uselist=False
    )


class Athlete(Base):
    __tablename__ = "athletes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ftp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_hr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resting_hr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # JSON columns: [{low, high, name}]
    hr_zones: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    power_zones: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # JSON column: {days_per_week, max_hours_per_week, long_ride_day}
    availability: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # JSON column: [{date, ftp, method}]
    ftp_tests: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=list)
    # JSON column: user preferences e.g. {auto_analyze: bool}
    app_settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Profile picture stored on disk
    avatar_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Strava fields (Phase 2)
    strava_athlete_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    strava_access_token: Mapped[Optional[str]] = mapped_column(EncryptedString, nullable=True)
    strava_refresh_token: Mapped[Optional[str]] = mapped_column(EncryptedString, nullable=True)
    strava_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    user: Mapped["User"] = relationship("User", back_populates="athlete")
    activities: Mapped[list["Activity"]] = relationship(
        "Activity", back_populates="athlete"
    )
    goals: Mapped[list["Goal"]] = relationship("Goal", back_populates="athlete")
    daily_metrics: Mapped[list["DailyMetric"]] = relationship(
        "DailyMetric", back_populates="athlete"
    )
    training_plans: Mapped[list["TrainingPlan"]] = relationship(
        "TrainingPlan", back_populates="athlete"
    )


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    athlete_id: Mapped[str] = mapped_column(
        String, ForeignKey("athletes.id", ondelete="CASCADE")
    )
    strava_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, unique=True)
    source: Mapped[str] = mapped_column(String, default="upload")
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sport_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_s: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    distance_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    elevation_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_power: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    normalized_power: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_hr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_hr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_speed_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_cadence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    intensity_factor: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fit_file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")
    analysis_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    analysis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    athlete: Mapped["Athlete"] = relationship("Athlete", back_populates="activities")
    streams: Mapped[list["ActivityStream"]] = relationship(
        "ActivityStream", back_populates="activity", cascade="all, delete-orphan"
    )

    @property
    def has_fit_file(self) -> bool:
        return bool(self.fit_file_path)


class ActivityStream(Base):
    __tablename__ = "activity_streams"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    activity_id: Mapped[str] = mapped_column(
        String, ForeignKey("activities.id", ondelete="CASCADE")
    )
    stream_type: Mapped[str] = mapped_column(String)
    data: Mapped[list] = mapped_column(JSON)

    activity: Mapped["Activity"] = relationship("Activity", back_populates="streams")


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    athlete_id: Mapped[str] = mapped_column(
        String, ForeignKey("athletes.id", ondelete="CASCADE"), primary_key=True
    )
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    ctl: Mapped[float] = mapped_column(Float, default=0.0)
    atl: Mapped[float] = mapped_column(Float, default=0.0)
    tsb: Mapped[float] = mapped_column(Float, default=0.0)
    tss_day: Mapped[float] = mapped_column(Float, default=0.0)

    athlete: Mapped["Athlete"] = relationship("Athlete", back_populates="daily_metrics")


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    athlete_id: Mapped[str] = mapped_column(
        String, ForeignKey("athletes.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    target_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    metric: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    athlete: Mapped["Athlete"] = relationship("Athlete", back_populates="goals")


class TrainingPlan(Base):
    __tablename__ = "training_plans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    athlete_id: Mapped[str] = mapped_column(
        String, ForeignKey("athletes.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    goal: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    weeks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    generation_method: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    athlete: Mapped["Athlete"] = relationship(
        "Athlete", back_populates="training_plans"
    )
    workouts: Mapped[list["PlannedWorkout"]] = relationship(
        "PlannedWorkout", back_populates="plan", cascade="all, delete-orphan"
    )


class PlannedWorkout(Base):
    __tablename__ = "planned_workouts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    plan_id: Mapped[str] = mapped_column(
        String, ForeignKey("training_plans.id", ondelete="CASCADE")
    )
    week_number: Mapped[int] = mapped_column(Integer, default=1)
    day_of_week: Mapped[int] = mapped_column(Integer, default=1)  # 1=Mon, 7=Sun
    workout_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    duration_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    target_tss: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completed_activity_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("activities.id", ondelete="SET NULL"), nullable=True
    )

    plan: Mapped["TrainingPlan"] = relationship(
        "TrainingPlan", back_populates="workouts"
    )
