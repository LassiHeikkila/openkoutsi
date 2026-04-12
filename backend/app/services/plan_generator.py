"""
Simple rule-based training plan generator.

Generates a polarised weekly schedule:
  Mon: rest
  Tue: threshold or vo2max (hard)
  Wed: easy endurance
  Thu: tempo or endurance (medium)
  Fri: rest
  Sat: long endurance
  Sun: easy recovery
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.orm import TrainingPlan, PlannedWorkout, Athlete


# day_of_week: 1=Mon ... 7=Sun
_BASE_WEEK: list[dict] = [
    {"day_of_week": 1, "workout_type": "rest", "duration_min": None, "target_tss": None, "description": None},
    {"day_of_week": 2, "workout_type": "threshold", "duration_min": 60, "target_tss": 80, "description": "2×20 min at threshold power"},
    {"day_of_week": 3, "workout_type": "easy", "duration_min": 60, "target_tss": 40, "description": "Zone 2 aerobic"},
    {"day_of_week": 4, "workout_type": "endurance", "duration_min": 75, "target_tss": 55, "description": "Steady endurance with some tempo efforts"},
    {"day_of_week": 5, "workout_type": "rest", "duration_min": None, "target_tss": None, "description": None},
    {"day_of_week": 6, "workout_type": "endurance", "duration_min": 120, "target_tss": 90, "description": "Long easy endurance ride"},
    {"day_of_week": 7, "workout_type": "easy", "duration_min": 45, "target_tss": 25, "description": "Active recovery spin"},
]

_PEAK_WEEK: list[dict] = [
    {"day_of_week": 1, "workout_type": "rest", "duration_min": None, "target_tss": None, "description": None},
    {"day_of_week": 2, "workout_type": "vo2max", "duration_min": 60, "target_tss": 90, "description": "5×5 min VO2max intervals"},
    {"day_of_week": 3, "workout_type": "easy", "duration_min": 60, "target_tss": 40, "description": "Zone 2 aerobic"},
    {"day_of_week": 4, "workout_type": "threshold", "duration_min": 90, "target_tss": 100, "description": "3×20 min threshold"},
    {"day_of_week": 5, "workout_type": "rest", "duration_min": None, "target_tss": None, "description": None},
    {"day_of_week": 6, "workout_type": "endurance", "duration_min": 150, "target_tss": 120, "description": "Long endurance with race-pace effort"},
    {"day_of_week": 7, "workout_type": "easy", "duration_min": 45, "target_tss": 25, "description": "Active recovery"},
]

_RECOVERY_WEEK: list[dict] = [
    {"day_of_week": 1, "workout_type": "rest", "duration_min": None, "target_tss": None, "description": None},
    {"day_of_week": 2, "workout_type": "easy", "duration_min": 45, "target_tss": 25, "description": "Easy spin"},
    {"day_of_week": 3, "workout_type": "easy", "duration_min": 60, "target_tss": 35, "description": "Zone 2"},
    {"day_of_week": 4, "workout_type": "tempo", "duration_min": 60, "target_tss": 55, "description": "Moderate tempo"},
    {"day_of_week": 5, "workout_type": "rest", "duration_min": None, "target_tss": None, "description": None},
    {"day_of_week": 6, "workout_type": "endurance", "duration_min": 90, "target_tss": 65, "description": "Shorter long ride"},
    {"day_of_week": 7, "workout_type": "rest", "duration_min": None, "target_tss": None, "description": None},
]


def _week_template(week_num: int, total_weeks: int, goal: Optional[str]) -> list[dict]:
    """Choose the template for a given week number."""
    # Last week before goal event: taper/rest if goal == 'peak_fitness'
    if week_num == total_weeks:
        return _RECOVERY_WEEK
    # Every 4th week is a recovery week
    if week_num % 4 == 0:
        return _RECOVERY_WEEK
    # Final build block
    if goal == "peak_fitness" and week_num >= total_weeks - 3:
        return _PEAK_WEEK
    return _BASE_WEEK


async def generate_plan(
    athlete_id: int,
    name: str,
    start_date: date,
    num_weeks: int,
    goal: Optional[str],
    session: AsyncSession,
) -> TrainingPlan:
    """Create a TrainingPlan with PlannedWorkout rows."""

    end_date = start_date + timedelta(weeks=num_weeks) - timedelta(days=1)

    plan = TrainingPlan(
        athlete_id=athlete_id,
        name=name,
        start_date=start_date,
        end_date=end_date,
        goal=goal,
        weeks=num_weeks,
        status="active",
    )
    session.add(plan)
    await session.flush()  # get plan.id

    workouts: list[PlannedWorkout] = []
    for week_num in range(1, num_weeks + 1):
        template = _week_template(week_num, num_weeks, goal)
        for day in template:
            if day["workout_type"] == "rest" and day["target_tss"] is None:
                # Still store rest days so the calendar renders them
                pass
            workouts.append(
                PlannedWorkout(
                    plan_id=plan.id,
                    week_number=week_num,
                    **day,
                )
            )

    session.add_all(workouts)
    await session.commit()
    await session.refresh(plan)
    return plan
