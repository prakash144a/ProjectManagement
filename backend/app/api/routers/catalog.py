from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.db.session import get_db
from app.models.identity import User
from app.schemas.core import (
    MemberOut,
    StatusCreate,
    StatusOut,
    StatusReorder,
    StatusUpdate,
    TaskGroupCreate,
    TaskGroupDefCreate,
    TaskGroupDefOut,
    TaskGroupDefUpdate,
    TaskGroupOut,
)
from app.services import catalog_service, project_service, status_service, user_service

router = APIRouter(tags=["catalog"])


@router.get("/statuses", response_model=list[StatusOut])
def list_statuses(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
) -> list[StatusOut]:
    return [StatusOut.model_validate(s) for s in catalog_service.list_statuses(db, org_id)]


@router.post("/statuses", response_model=StatusOut, status_code=201)
def create_status(
    body: StatusCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> StatusOut:
    s = status_service.create_status(
        db, user.id, org_id,
        name=body.name, color=body.color,
        is_completed=body.is_completed, is_default=body.is_default,
    )
    return StatusOut.model_validate(s)


@router.patch("/statuses/{status_id}", response_model=StatusOut)
def update_status(
    status_id: uuid.UUID,
    body: StatusUpdate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> StatusOut:
    s = status_service.update_status(
        db, user.id, org_id, status_id,
        name=body.name, color=body.color,
        is_completed=body.is_completed, is_default=body.is_default,
    )
    return StatusOut.model_validate(s)


@router.post("/statuses/reorder", response_model=list[StatusOut])
def reorder_statuses(
    body: StatusReorder,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[StatusOut]:
    return [
        StatusOut.model_validate(s)
        for s in status_service.reorder_statuses(db, user.id, org_id, body.ids)
    ]


@router.delete("/statuses/{status_id}", status_code=204)
def delete_status(
    status_id: uuid.UUID,
    confirm: bool = Query(default=False),
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    status_service.delete_status(db, user.id, org_id, status_id, confirm)


@router.get("/task-group-definitions", response_model=list[TaskGroupDefOut])
def list_task_group_definitions(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
) -> list[TaskGroupDefOut]:
    return [
        TaskGroupDefOut.model_validate(d)
        for d in catalog_service.list_definitions(db, org_id)
    ]


@router.post("/task-group-definitions", response_model=TaskGroupDefOut, status_code=201)
def create_task_group_definition(
    body: TaskGroupDefCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> TaskGroupDefOut:
    d = catalog_service.create_definition(db, user.id, org_id, body.name, body.is_default)
    return TaskGroupDefOut.model_validate(d)


@router.patch("/task-group-definitions/{def_id}", response_model=TaskGroupDefOut)
def update_task_group_definition(
    def_id: uuid.UUID,
    body: TaskGroupDefUpdate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> TaskGroupDefOut:
    d = catalog_service.update_definition(
        db, user.id, org_id, def_id, name=body.name, is_default=body.is_default
    )
    return TaskGroupDefOut.model_validate(d)


@router.delete("/task-group-definitions/{def_id}", status_code=204)
def delete_task_group_definition(
    def_id: uuid.UUID,
    confirm: bool = Query(default=False),
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    catalog_service.delete_definition(db, user.id, org_id, def_id, confirm)


@router.get("/members", response_model=list[MemberOut])
def list_members(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
) -> list[MemberOut]:
    return [
        MemberOut(
            id=u.id,
            display_name=u.display_name,
            email=u.email,
            username=u.username,
            mobile=u.mobile,
            role=role,
        )
        for u, role in user_service.list_members(db, org_id)
    ]


@router.get("/projects/{project_id}/task-groups", response_model=list[TaskGroupOut])
def list_task_groups(
    project_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
) -> list[TaskGroupOut]:
    return [
        TaskGroupOut.model_validate(g)
        for g in catalog_service.list_task_groups(db, org_id, project_id)
    ]


@router.post("/projects/{project_id}/task-groups", response_model=TaskGroupOut, status_code=201)
def create_task_group(
    project_id: uuid.UUID,
    body: TaskGroupCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> TaskGroupOut:
    ptg = project_service.create_task_group(db, user.id, org_id, project_id, body.name)
    return TaskGroupOut.model_validate(ptg)
