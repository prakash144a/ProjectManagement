from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.db.session import get_db
from app.models.identity import User
from app.schemas.core import ProjectCreate, ProjectOut
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    body: ProjectCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> ProjectOut:
    proj = project_service.create_project(
        db, user.id, org_id, body.team_id, body.name, body.description
    )
    return ProjectOut.model_validate(proj)


@router.get("", response_model=list[ProjectOut])
def list_projects(
    team_id: uuid.UUID | None = None,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[ProjectOut]:
    return [
        ProjectOut.model_validate(p)
        for p in project_service.list_projects(db, user.id, org_id, team_id)
    ]
