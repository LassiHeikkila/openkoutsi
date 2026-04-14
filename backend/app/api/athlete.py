import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.db.base import get_session
from backend.app.models.orm import Activity, Athlete, User
from backend.app.schemas.athlete import AthleteResponse, AthleteUpdate

router = APIRouter(prefix="/athlete", tags=["athlete"])


async def _get_athlete(user: User, session: AsyncSession) -> Athlete:
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")
    return athlete


def _athlete_response(athlete: Athlete) -> AthleteResponse:
    return AthleteResponse(
        id=athlete.id,
        user_id=athlete.user_id,
        name=athlete.name,
        date_of_birth=athlete.date_of_birth,
        weight_kg=athlete.weight_kg,
        ftp=athlete.ftp,
        max_hr=athlete.max_hr,
        resting_hr=athlete.resting_hr,
        hr_zones=athlete.hr_zones or [],
        power_zones=athlete.power_zones or [],
        ftp_tests=athlete.ftp_tests or [],
        strava_connected=bool(athlete.strava_athlete_id),
        app_settings=athlete.app_settings or {},
        created_at=athlete.created_at,
        updated_at=athlete.updated_at,
    )


@router.get("/", response_model=AthleteResponse)
async def get_athlete(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)
    return _athlete_response(athlete)


@router.put("/", response_model=AthleteResponse)
async def update_athlete(
    body: AthleteUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    if body.name is not None:
        athlete.name = body.name
    if body.date_of_birth is not None:
        athlete.date_of_birth = body.date_of_birth
    if body.weight_kg is not None:
        athlete.weight_kg = body.weight_kg
    if body.ftp is not None:
        athlete.ftp = body.ftp
        # Record FTP test
        tests = list(athlete.ftp_tests or [])
        tests.append({"date": datetime.now(timezone.utc).date().isoformat(), "ftp": body.ftp, "method": "manual"})
        athlete.ftp_tests = tests
    if body.max_hr is not None:
        athlete.max_hr = body.max_hr
    if body.resting_hr is not None:
        athlete.resting_hr = body.resting_hr
    if body.hr_zones is not None:
        athlete.hr_zones = [z.model_dump() for z in body.hr_zones]
    if body.power_zones is not None:
        athlete.power_zones = [z.model_dump() for z in body.power_zones]
    if body.app_settings is not None:
        athlete.app_settings = body.app_settings

    athlete.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(athlete)
    return _athlete_response(athlete)


@router.get("/export")
async def export_athlete(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    athlete = await _get_athlete(user, session)

    profile_data = {
        "id": athlete.id,
        "email": user.email,
        "name": athlete.name,
        "date_of_birth": athlete.date_of_birth.isoformat() if athlete.date_of_birth else None,
        "weight_kg": athlete.weight_kg,
        "ftp": athlete.ftp,
        "max_hr": athlete.max_hr,
        "resting_hr": athlete.resting_hr,
        "hr_zones": athlete.hr_zones or [],
        "power_zones": athlete.power_zones or [],
        "ftp_tests": athlete.ftp_tests or [],
        "created_at": athlete.created_at.isoformat(),
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }

    activities_result = await session.execute(
        select(Activity)
        .where(Activity.athlete_id == athlete.id)
        .order_by(Activity.start_time.asc())
    )
    activities = activities_result.scalars().all()

    activities_data = [
        {
            "id": a.id,
            "name": a.name,
            "sport_type": a.sport_type,
            "start_time": a.start_time.isoformat() if a.start_time else None,
            "duration_s": a.duration_s,
            "distance_m": a.distance_m,
            "elevation_m": a.elevation_m,
            "avg_power": a.avg_power,
            "normalized_power": a.normalized_power,
            "avg_hr": a.avg_hr,
            "max_hr": a.max_hr,
            "tss": a.tss,
            "intensity_factor": a.intensity_factor,
            "source": a.source,
            "status": a.status,
            "created_at": a.created_at.isoformat(),
            "has_fit_file": bool(a.fit_file_path),
        }
        for a in activities
    ]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("profile.json", json.dumps(profile_data, indent=2))
        zf.writestr("activities.json", json.dumps(activities_data, indent=2))
        for a in activities:
            if a.fit_file_path:
                fit_path = Path(a.fit_file_path)
                if fit_path.exists():
                    zf.write(fit_path, f"fit_files/{a.id}.fit")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=openkoutsi_export.zip"},
    )
