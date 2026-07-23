from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.db.session import get_db
from app.models.identity import User
from app.schemas.core import DashboardOut, MyTaskOut, TaskOut
from app.services import metrics_service

router = APIRouter(tags=["metrics"])


@router.get("/my-tasks", response_model=list[MyTaskOut])
def my_tasks(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[MyTaskOut]:
    return [
        MyTaskOut(
            **TaskOut.model_validate(task).model_dump(),
            team_id=team_id,
            project_name=project_name,
            team_name=team_name,
        )
        for (task, project_name, team_name, team_id) in metrics_service.my_tasks(
            db, user.id, org_id
        )
    ]


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    team_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> DashboardOut:
    return DashboardOut.model_validate(
        metrics_service.dashboard(
            db, user.id, org_id, team_id=team_id, project_id=project_id
        )
    )
