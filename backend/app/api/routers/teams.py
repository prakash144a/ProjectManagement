from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.db.session import get_db
from app.models.identity import User
from app.schemas.core import (
    MemberAdd,
    MemberRoleIn,
    TeamCreate,
    TeamMemberOut,
    TeamOut,
)
from app.services import team_service

router = APIRouter(prefix="/teams", tags=["teams"])


@router.post("", response_model=TeamOut, status_code=201)
def create_team(
    body: TeamCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> TeamOut:
    grp = team_service.create_group(
        db, user.id, org_id,
        name=body.name, type=body.type,
        members=[(m.user_id, m.role) for m in body.members],
    )
    return TeamOut.model_validate(grp)


@router.get("", response_model=list[TeamOut])
def list_teams(
    type: str | None = None,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[TeamOut]:
    return [
        TeamOut.model_validate(g)
        for g in team_service.list_groups(db, user.id, org_id, type)
    ]


@router.delete("/{team_id}", status_code=204)
def delete_team(
    team_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    team_service.delete_group(db, user.id, org_id, team_id)


@router.get("/{team_id}/members", response_model=list[TeamMemberOut])
def list_members(
    team_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[TeamMemberOut]:
    return [
        TeamMemberOut(
            id=u.id, display_name=u.display_name, email=u.email, username=u.username, role=role
        )
        for u, role in team_service.list_members(db, user.id, org_id, team_id)
    ]


@router.post("/{team_id}/members", response_model=TeamMemberOut, status_code=201)
def add_member(
    team_id: uuid.UUID,
    body: MemberAdd,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> TeamMemberOut:
    team_service.add_member(db, user.id, org_id, team_id, body.user_id, body.role)
    u = db.get(User, body.user_id)
    return TeamMemberOut(
        id=u.id, display_name=u.display_name, email=u.email, username=u.username, role=body.role
    )


@router.patch("/{team_id}/members/{user_id}", response_model=TeamMemberOut)
def set_member_role(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberRoleIn,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> TeamMemberOut:
    team_service.set_member_role(db, user.id, org_id, team_id, user_id, body.role)
    u = db.get(User, user_id)
    return TeamMemberOut(
        id=u.id, display_name=u.display_name, email=u.email, username=u.username, role=body.role
    )


@router.delete("/{team_id}/members/{user_id}", status_code=204)
def remove_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    team_service.remove_member(db, user.id, org_id, team_id, user_id)
