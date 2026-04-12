"""
LLM-based training plan generator.

Uses any OpenAI-compatible chat completions API (Ollama, OpenAI, Mistral, etc.)
via httpx. No additional dependencies required.

Configure via environment variables:
  LLM_BASE_URL  e.g. "http://localhost:11434/v1" or "https://api.openai.com/v1"
  LLM_API_KEY   empty string is fine for local models
  LLM_MODEL     e.g. "llama3.2", "gpt-4o-mini", "mistral"
"""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models.orm import TrainingPlan, PlannedWorkout, Athlete, DailyMetric
from ..schemas.plans import PlanConfig


_SYSTEM_PROMPT = """\
You are an expert endurance sports coach that creates personalised training plans.
You MUST respond with ONLY valid JSON — no markdown, no prose, no code fences.
The JSON must conform exactly to the schema provided by the user.
Do not include any explanation or commentary outside the JSON object.
"""

_SCHEMA_EXAMPLE = """\
{
  "weeks": [
    {
      "week_number": 1,
      "workouts": [
        {
          "day_of_week": 1,
          "workout_type": "rest",
          "description": null,
          "duration_min": null,
          "target_tss": null
        },
        {
          "day_of_week": 2,
          "workout_type": "threshold",
          "description": "2x20 min at threshold power",
          "duration_min": 60,
          "target_tss": 80
        }
      ]
    }
  ]
}

Rules:
- day_of_week: integer 1 (Monday) to 7 (Sunday)
- workout_type: one of "easy", "tempo", "threshold", "vo2max", "endurance", "long", "strength", "yoga", "cross-training", "rest"
- Every week must have exactly 7 workouts, one per day_of_week (1-7)
- Days not scheduled as training should be "rest" with null duration and tss
- TSS and duration_min must be null for rest days, integers otherwise
- Scale TSS and duration progressively across weeks (base building, recovery every 4th week, taper at end)
"""


def _build_user_prompt(
    config: PlanConfig,
    goal: Optional[str],
    num_weeks: int,
    ftp: Optional[int],
    ctl: Optional[float],
) -> str:
    day_names = {1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday",
                 5: "Friday", 6: "Saturday", 7: "Sunday"}

    scheduled = []
    for dc in sorted(config.day_configs, key=lambda d: d.day_of_week):
        note = f" ({dc.notes})" if dc.notes else ""
        scheduled.append(f"  - {day_names[dc.day_of_week]}: {dc.workout_type}{note}")

    lines = [
        f"Create a {num_weeks}-week training plan with the following requirements:",
        "",
        f"Periodization style: {config.periodization}",
        f"Intensity preference: {config.intensity_preference}",
        f"Training days per week: {config.days_per_week}",
        "",
        "Scheduled training days:",
    ] + scheduled

    if goal:
        lines += ["", f"Goal/event: {goal}"]
    if config.long_description:
        lines += ["", f"Additional context: {config.long_description}"]
    if ftp:
        lines += ["", f"Athlete FTP: {ftp}W"]
    if ctl is not None:
        lines += [f"Current fitness (CTL): {ctl:.1f} TSS/day"]

    lines += [
        "",
        f"Output exactly {num_weeks} weeks in the JSON schema below.",
        "",
        _SCHEMA_EXAMPLE,
    ]

    return "\n".join(lines)


def _extract_json(text: str) -> str:
    """Strip markdown code fences if present and return raw JSON string."""
    text = text.strip()
    # Remove ```json ... ``` or ``` ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text


def _parse_response(raw: str, num_weeks: int) -> list[list[dict]]:
    """Parse LLM JSON response into a list of weeks, each a list of day dicts."""
    data = json.loads(_extract_json(raw))
    weeks_data = data["weeks"]
    if len(weeks_data) != num_weeks:
        raise ValueError(
            f"Expected {num_weeks} weeks, got {len(weeks_data)}"
        )
    result = []
    for week in weeks_data:
        workouts = week["workouts"]
        if len(workouts) != 7:
            raise ValueError(
                f"Week {week['week_number']} has {len(workouts)} days, expected 7"
            )
        # Normalise each workout dict
        normalised = []
        for w in sorted(workouts, key=lambda x: x["day_of_week"]):
            normalised.append({
                "day_of_week": int(w["day_of_week"]),
                "workout_type": str(w.get("workout_type", "rest")),
                "description": w.get("description") or None,
                "duration_min": int(w["duration_min"]) if w.get("duration_min") is not None else None,
                "target_tss": int(w["target_tss"]) if w.get("target_tss") is not None else None,
            })
        result.append(normalised)
    return result


async def _call_llm(user_prompt: str) -> str:
    """Call the OpenAI-compatible chat completions endpoint, return raw text."""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"

    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.llm_base_url.rstrip('/')}/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()

    return resp.json()["choices"][0]["message"]["content"]


async def generate_plan_llm(
    athlete: Athlete,
    config: PlanConfig,
    name: str,
    start_date: date,
    num_weeks: int,
    goal: Optional[str],
    session: AsyncSession,
) -> TrainingPlan:
    """Generate a TrainingPlan using an LLM via OpenAI-compatible API."""

    # Fetch athlete's latest CTL for context
    ctl: Optional[float] = None
    result = await session.execute(
        select(DailyMetric)
        .where(DailyMetric.athlete_id == athlete.id)
        .order_by(DailyMetric.date.desc())
        .limit(1)
    )
    latest_metric = result.scalar_one_or_none()
    if latest_metric:
        ctl = latest_metric.ctl

    user_prompt = _build_user_prompt(config, goal, num_weeks, athlete.ftp, ctl)

    # Call LLM with one retry on parse failure
    raw = await _call_llm(user_prompt)
    try:
        weeks_data = _parse_response(raw, num_weeks)
    except (json.JSONDecodeError, KeyError, ValueError):
        # Retry with a correction nudge
        correction = (
            user_prompt
            + "\n\nYour previous response could not be parsed as valid JSON matching "
            "the required schema. Respond with ONLY the JSON object, nothing else."
        )
        raw = await _call_llm(correction)
        weeks_data = _parse_response(raw, num_weeks)  # raises HTTP 503 if still invalid

    end_date = start_date + timedelta(weeks=num_weeks) - timedelta(days=1)

    plan = TrainingPlan(
        athlete_id=athlete.id,
        name=name,
        start_date=start_date,
        end_date=end_date,
        goal=goal,
        weeks=num_weeks,
        status="active",
        config=config.model_dump(),
        generation_method="llm",
    )
    session.add(plan)
    await session.flush()

    workouts: list[PlannedWorkout] = []
    for week_num, week_days in enumerate(weeks_data, start=1):
        for day in week_days:
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
