"""
LLM-based workout analysis service.

Streams a coaching analysis from any OpenAI-compatible chat completions API
and persists the result incrementally to the database so local models that
take several minutes never time out and the frontend can show live progress.

Uses the same LLM configuration as llm_plan_generator:
  LLM_BASE_URL  e.g. "http://localhost:11434/v1"
  LLM_API_KEY   empty string is fine for local models
  LLM_MODEL     e.g. "llama3.2", "gpt-4o-mini"
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import TYPE_CHECKING, AsyncIterator

import httpx
from sqlalchemy import select

from ..db.team_session import get_team_session_factory
from ..models.team_orm import Activity, Athlete

if TYPE_CHECKING:
    pass

log = logging.getLogger(__name__)


_SYSTEM_PROMPT = """\
You are an expert endurance sports coach. Analyse the following workout data and \
provide actionable coaching feedback in 3-5 paragraphs. Cover: effort quality and \
pacing, power/heart-rate relationship if data is available, training load context, \
and 1-2 specific recommendations for the athlete's next sessions.
Write in plain prose — no markdown headers, no bullet points, no code blocks.\
"""


def _build_prompt(activity: Activity, athlete: Athlete) -> str:
    lines = [f"Workout summary for a {activity.sport_type or 'unknown sport'} session:"]

    if activity.start_time:
        lines.append(f"  Date: {activity.start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    if activity.duration_s:
        mins, secs = divmod(activity.duration_s, 60)
        hours, mins = divmod(mins, 60)
        if hours:
            lines.append(f"  Duration: {hours}h {mins}m {secs}s")
        else:
            lines.append(f"  Duration: {mins}m {secs}s")
    if activity.distance_m:
        lines.append(f"  Distance: {activity.distance_m / 1000:.2f} km")
    if activity.elevation_m:
        lines.append(f"  Elevation gain: {activity.elevation_m:.0f} m")
    if activity.avg_power:
        lines.append(f"  Average power: {activity.avg_power:.0f} W")
    if activity.normalized_power:
        lines.append(f"  Normalized power: {activity.normalized_power:.0f} W")
    if activity.intensity_factor:
        lines.append(f"  Intensity factor: {activity.intensity_factor:.3f}")
    if activity.tss:
        lines.append(f"  Training stress score (TSS): {activity.tss:.1f}")
    if activity.avg_hr:
        lines.append(f"  Average heart rate: {activity.avg_hr:.0f} bpm")
    if activity.max_hr:
        lines.append(f"  Peak heart rate: {activity.max_hr:.0f} bpm")
    if athlete.ftp:
        lines.append(f"  Athlete FTP: {athlete.ftp} W")
    if athlete.max_hr:
        lines.append(f"  Athlete max HR: {athlete.max_hr} bpm")

    if activity.intervals:
        lines.append("\nInterval breakdown:")
        for iv in activity.intervals:
            mins, secs = divmod(iv.duration_s, 60)
            line = f"  Interval {iv.interval_number}: {mins}m {secs}s"
            if iv.avg_hr:
                line += f", avg HR {iv.avg_hr:.0f} bpm"
            if iv.avg_power:
                line += f", avg power {iv.avg_power:.0f} W"
            if iv.avg_speed_ms:
                line += f", avg speed {iv.avg_speed_ms * 3.6:.1f} km/h"
            if iv.is_auto_split:
                line += " (auto-split)"
            lines.append(line)

    return "\n".join(lines)


async def _stream_analysis(activity: Activity, athlete: Athlete) -> AsyncIterator[str]:
    """Yield text chunks from the LLM via streaming SSE."""
    app_settings = athlete.app_settings or {}
    base_url = (app_settings.get("llm_base_url") or "").strip()
    model = (app_settings.get("llm_model") or "").strip()

    if not base_url or not model:
        raise ValueError("LLM base URL and model must be configured in Settings → AI / LLM")

    url = f"{base_url.rstrip('/')}/chat/completions"
    headers: dict[str, str] = {"Content-Type": "application/json"}

    enc_key = app_settings.get("llm_api_key_enc")
    team_id = getattr(athlete, "_team_id", None)
    if enc_key and team_id:
        try:
            from backend.app.core.file_encryption import decrypt_secret
            api_key = decrypt_secret(str(enc_key), team_id, athlete.global_user_id)
            headers["Authorization"] = f"Bearer {api_key}"
        except Exception:
            log.warning("Could not decrypt LLM API key for athlete %s — proceeding without auth", athlete.id)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _build_prompt(activity, athlete)},
        ],
        "temperature": 0.7,
        "stream": True,
    }

    # Local models can take several minutes; use a generous but finite timeout.
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(300.0, connect=10.0)  # 5-minute read timeout
    ) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    content = chunk["choices"][0]["delta"].get("content", "")
                    if content:
                        yield content
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


async def analyze_activity_bg(activity_id: str, athlete_id: str, team_id: str) -> None:
    """
    Background task: stream LLM analysis → write chunks to DB every 500 ms
    → set final analysis_status to 'done' or 'error'.

    Lives in the service layer so it can be imported from both api/activities.py
    and services/strava_sync.py without circular dependencies.
    """
    async with get_team_session_factory(team_id)() as session:
        activity_result = await session.execute(
            select(Activity).where(Activity.id == activity_id)
        )
        activity = activity_result.scalar_one()

        athlete_result = await session.execute(
            select(Athlete).where(Athlete.id == athlete_id)
        )
        athlete = athlete_result.scalar_one()
        athlete._team_id = team_id  # pass team_id for decrypt_secret in _stream_analysis

        buffer: list[str] = []
        last_flush = time.monotonic()
        accumulated = ""

        try:
            async for chunk in _stream_analysis(activity, athlete):
                buffer.append(chunk)
                if time.monotonic() - last_flush >= 0.5:
                    accumulated += "".join(buffer)
                    buffer.clear()
                    last_flush = time.monotonic()
                    activity.analysis = accumulated
                    await session.commit()

            # Final flush
            accumulated += "".join(buffer)
            activity.analysis = accumulated
            activity.analysis_status = "done"
            await session.commit()
            log.info("Analysis complete for activity %s", activity_id)

        except Exception:
            log.exception("Analysis failed for activity %s", activity_id)
            activity.analysis_status = "error"
            await session.commit()
