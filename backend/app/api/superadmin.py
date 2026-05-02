from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.db.registry import get_registry_session
from backend.app.models.registry_orm import Team, TeamMembership
from backend.app.schemas.teams import SuperadminTeamResponse

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


def _require_secret(x_superadmin_secret: str | None = Header(default=None)) -> None:
    if not settings.superadmin_secret:
        raise HTTPException(status_code=503, detail="Superadmin not configured")
    if x_superadmin_secret != settings.superadmin_secret:
        raise HTTPException(status_code=403, detail="Invalid superadmin secret")


@router.get("/teams", response_model=list[SuperadminTeamResponse])
async def list_teams(
    _: None = Depends(_require_secret),
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(select(Team).order_by(Team.created_at.desc()))
    teams = result.scalars().all()

    counts_result = await session.execute(
        select(TeamMembership.team_id, func.count().label("n"))
        .group_by(TeamMembership.team_id)
    )
    counts = {row.team_id: row.n for row in counts_result}

    return [
        SuperadminTeamResponse(
            id=t.id,
            slug=t.slug,
            name=t.name,
            status=t.status,
            created_at=t.created_at,
            member_count=counts.get(t.id, 0),
        )
        for t in teams
    ]


@router.post("/teams/{team_id}/approve", response_model=SuperadminTeamResponse)
async def approve_team(
    team_id: str,
    _: None = Depends(_require_secret),
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    team.status = "active"
    await session.commit()

    count_result = await session.execute(
        select(func.count()).select_from(TeamMembership).where(TeamMembership.team_id == team_id)
    )
    return SuperadminTeamResponse(
        id=team.id,
        slug=team.slug,
        name=team.name,
        status=team.status,
        created_at=team.created_at,
        member_count=count_result.scalar_one(),
    )


@router.delete("/teams/{team_id}", status_code=204)
async def delete_team(
    team_id: str,
    _: None = Depends(_require_secret),
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    await session.delete(team)
    await session.commit()
