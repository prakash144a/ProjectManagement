from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.db.session import get_db
from app.models.enums import PrincipalType
from app.models.identity import AccessGrant
from app.models.identity import User as UserModel
from app.schemas.core import GrantCreate, GrantOut, GroupOut
from app.services import security_service

router = APIRouter(tags=["security"])


def _grant_out(g: AccessGrant, name: str | None) -> GrantOut:
    principal_id = (
        g.principal_user_id if g.principal_type == PrincipalType.USER else g.principal_group_id
    )
    return GrantOut(
        id=g.id,
        principal_type=g.principal_type,
        principal_id=principal_id,
        principal_name=name,
        role=g.role,
    )


@router.get("/groups", response_model=list[GroupOut])
def list_groups(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
) -> list[GroupOut]:
    return [GroupOut.model_validate(g) for g in security_service.list_groups(db, org_id)]


@router.get("/projects/{project_id}/grants", response_model=list[GrantOut])
def list_project_grants(
    project_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: UserModel = Depends(current_user),
) -> list[GrantOut]:
    return [
        _grant_out(g, name)
        for g, name in security_service.list_project_grants(db, user.id, org_id, project_id)
    ]


@router.post("/projects/{project_id}/grants", response_model=GrantOut, status_code=201)
def add_project_grant(
    project_id: uuid.UUID,
    body: GrantCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: UserModel = Depends(current_user),
) -> GrantOut:
    g, name = security_service.add_project_grant(
        db, user.id, org_id, project_id,
        principal_type=body.principal_type, principal_id=body.principal_id, role=body.role,
    )
    return _grant_out(g, name)


@router.delete("/projects/{project_id}/grants/{grant_id}", status_code=204)
def delete_project_grant(
    project_id: uuid.UUID,
    grant_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: UserModel = Depends(current_user),
) -> None:
    security_service.delete_project_grant(db, user.id, org_id, project_id, grant_id)
