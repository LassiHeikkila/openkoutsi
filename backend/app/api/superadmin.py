from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import json

from backend.app.core.config import settings
from backend.app.db.registry import get_registry_session
from backend.app.models.registry_orm import DataConsent, Team, TeamMembership, User
from backend.app.schemas.teams import SuperadminTeamResponse, SuperadminUserResponse, SuperadminUserTeam

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

    consent_counts_result = await session.execute(
        select(DataConsent.team_id, func.count().label("n"))
        .group_by(DataConsent.team_id)
    )
    consent_counts = {row.team_id: row.n for row in consent_counts_result}

    return [
        SuperadminTeamResponse(
            id=t.id,
            slug=t.slug,
            name=t.name,
            status=t.status,
            created_at=t.created_at,
            member_count=counts.get(t.id, 0),
            consented_count=consent_counts.get(t.id, 0),
        )
        for t in teams
    ]


@router.get("/users", response_model=list[SuperadminUserResponse])
async def list_users(
    _: None = Depends(_require_secret),
    session: AsyncSession = Depends(get_registry_session),
):
    users_result = await session.execute(
        select(User).where(User.deleted_at.is_(None)).order_by(User.created_at.desc())
    )
    users = users_result.scalars().all()

    memberships_result = await session.execute(
        select(TeamMembership, Team)
        .join(Team, TeamMembership.team_id == Team.id)
    )
    memberships_by_user: dict[str, list[tuple]] = {}
    for membership, team in memberships_result:
        memberships_by_user.setdefault(membership.user_id, []).append((membership, team))

    consents_result = await session.execute(select(DataConsent))
    consents: dict[tuple[str, str], DataConsent] = {
        (c.user_id, c.team_id): c for c in consents_result.scalars().all()
    }

    response = []
    for user in users:
        teams = []
        for membership, team in memberships_by_user.get(user.id, []):
            consent = consents.get((user.id, team.id))
            teams.append(SuperadminUserTeam(
                team_id=team.id,
                team_slug=team.slug,
                team_name=team.name,
                roles=json.loads(membership.roles),
                joined_at=membership.joined_at,
                consented_at=consent.consented_at if consent else None,
                consent_version=consent.consent_version if consent else None,
            ))
        response.append(SuperadminUserResponse(
            id=user.id,
            username=user.username,
            created_at=user.created_at,
            teams=teams,
        ))
    return response


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
