from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.db.session import get_db
from app.models.identity import User
from app.schemas.core import TaskCreate, TaskOut, TaskReorder, TaskUpdate
from app.services import task_service

router = APIRouter(tags=["tasks"])


@router.post("/projects/{project_id}/tasks/reorder", response_model=list[TaskOut])
def reorder_tasks(
    project_id: uuid.UUID,
    body: TaskReorder,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[TaskOut]:
    tasks = task_service.reorder_tasks(
        db, user.id, org_id, project_id, body.group_id, body.task_ids
    )
    return [TaskOut.model_validate(t) for t in tasks]


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(
    body: TaskCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> TaskOut:
    task = task_service.create_task(
        db,
        user.id,
        org_id,
        body.project_id,
        title=body.title,
        description=body.description,
        status_id=body.status_id,
        priority=body.priority,
        progress=body.progress,
        assignee_id=body.assignee_id,
        project_task_group_id=body.project_task_group_id,
        start_date=body.start_date,
        due_date=body.due_date,
    )
    return TaskOut.model_validate(task)


@router.get("/projects/{project_id}/tasks", response_model=list[TaskOut])
def list_tasks(
    project_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
) -> list[TaskOut]:
    return [
        TaskOut.model_validate(t)
        for t in task_service.list_tasks(db, org_id, project_id)
    ]


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(
    task_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
) -> TaskOut:
    return TaskOut.model_validate(task_service.get_task(db, org_id, task_id))


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> TaskOut:
    task = task_service.update_task(
        db, user.id, org_id, task_id, body.model_dump(exclude_unset=True)
    )
    return TaskOut.model_validate(task)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(
    task_id: uuid.UUID,
    confirm: bool = Query(default=False, description="Must be true — destructive action"),
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    task_service.delete_task(db, user.id, org_id, task_id, confirm)
