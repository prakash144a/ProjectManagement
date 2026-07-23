"""Read-only lookups the GUI needs: status catalog, project task groups, members."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.errors import NotFound
from app.models.enums import Role
from app.models.work import ProjectTaskGroup, TaskGroupDefinition, TaskStatus
from app.services import audit, authz
from app.services.project_service import get_project


def list_statuses(db: DbSession, org_id: uuid.UUID) -> list[TaskStatus]:
    return list(
        db.scalars(
            select(TaskStatus)
            .where(TaskStatus.organization_id == org_id)
            .order_by(TaskStatus.position)
        )
    )


def list_task_groups(
    db: DbSession, org_id: uuid.UUID, project_id: uuid.UUID
) -> list[ProjectTaskGroup]:
    get_project(db, org_id, project_id)  # 404 if not in org
    return list(
        db.scalars(
            select(ProjectTaskGroup)
            .where(ProjectTaskGroup.project_id == project_id)
            .order_by(ProjectTaskGroup.position)
        )
    )


# --- Org-level task-group catalog (Admin/Owner-managed) ---

def list_definitions(db: DbSession, org_id: uuid.UUID) -> list[TaskGroupDefinition]:
    return list(
        db.scalars(
            select(TaskGroupDefinition)
            .where(TaskGroupDefinition.organization_id == org_id)
            .order_by(TaskGroupDefinition.position)
        )
    )


def _get_definition(
    db: DbSession, org_id: uuid.UUID, def_id: uuid.UUID
) -> TaskGroupDefinition:
    d = db.get(TaskGroupDefinition, def_id)
    if d is None or d.organization_id != org_id:
        raise NotFound("Task group definition not found.")
    return d


def create_definition(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, name: str, is_default: bool
) -> TaskGroupDefinition:
    authz.require_role(db, user_id, org_id, Role.ADMIN)
    max_pos = db.scalar(
        select(func.coalesce(func.max(TaskGroupDefinition.position), -1)).where(
            TaskGroupDefinition.organization_id == org_id
        )
    )
    d = TaskGroupDefinition(
        organization_id=org_id,
        name=name,
        is_default=is_default,
        position=(max_pos or 0) + 1,
    )
    db.add(d)
    db.flush()
    audit.record(
        db, org_id=org_id, actor_id=user_id, action="task_group_def.create",
        target_type="task_group_definition", target_id=d.id,
        data={"name": name, "is_default": is_default},
    )
    db.flush()
    return d


def update_definition(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    def_id: uuid.UUID,
    *,
    name: str | None = None,
    is_default: bool | None = None,
) -> TaskGroupDefinition:
    authz.require_role(db, user_id, org_id, Role.ADMIN)
    d = _get_definition(db, org_id, def_id)
    if name is not None:
        d.name = name
    if is_default is not None:
        d.is_default = is_default
    db.flush()
    audit.record(
        db, org_id=org_id, actor_id=user_id, action="task_group_def.update",
        target_type="task_group_definition", target_id=d.id,
    )
    db.flush()
    return d


def delete_definition(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, def_id: uuid.UUID, confirm: bool
) -> None:
    if not confirm:
        from app.errors import BadRequest

        raise BadRequest("This action requires confirm=true.", code="confirmation_required")
    authz.require_role(db, user_id, org_id, Role.ADMIN)
    d = _get_definition(db, org_id, def_id)
    audit.record(
        db, org_id=org_id, actor_id=user_id, action="task_group_def.delete",
        target_type="task_group_definition", target_id=d.id, data={"name": d.name},
    )
    db.delete(d)  # existing ProjectTaskGroups keep their name (definition_id -> NULL)
    db.flush()
