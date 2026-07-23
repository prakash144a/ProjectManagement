from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.db.session import get_db
from app.models.identity import User
from app.schemas.core import MemberOut, SetRoleIn, UserCreate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


def _member_out(u: User, role: str | None) -> MemberOut:
    return MemberOut(
        id=u.id,
        display_name=u.display_name,
        email=u.email,
        username=u.username,
        mobile=u.mobile,
        role=role,
    )


@router.get("", response_model=list[MemberOut])
def list_users(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
) -> list[MemberOut]:
    return [_member_out(u, role) for u, role in user_service.list_members(db, org_id)]


@router.post("", response_model=MemberOut, status_code=201)
def create_user(
    body: UserCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    actor: User = Depends(current_user),
) -> MemberOut:
    user, role = user_service.create_user(
        db,
        actor.id,
        org_id,
        username=body.username,
        email=body.email,
        mobile=body.mobile,
        display_name=body.display_name,
        role=body.role,
    )
    return _member_out(user, role)


@router.patch("/{user_id}/role", response_model=MemberOut)
def set_role(
    user_id: uuid.UUID,
    body: SetRoleIn,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    actor: User = Depends(current_user),
) -> MemberOut:
    role = user_service.set_member_role(db, actor.id, org_id, user_id, body.role)
    user = db.get(User, user_id)
    return _member_out(user, role)
