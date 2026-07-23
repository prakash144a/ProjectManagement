"""Task CRUD with authorization, activity, and audit."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.db.base import utcnow
from app.errors import BadRequest, Forbidden, NotFound
from app.models.enums import Priority, Role
from app.models.work import Project, ProjectTaskGroup, Task, TaskStatus
from app.services import audit, authz, notification_service
from app.services.project_service import get_project


def _default_status(db: DbSession, org_id: uuid.UUID) -> TaskStatus | None:
    return db.scalars(
        select(TaskStatus)
        .where(TaskStatus.organization_id == org_id, TaskStatus.is_default.is_(True))
        .order_by(TaskStatus.position)
    ).first()


def _get_status(db: DbSession, org_id: uuid.UUID, status_id: uuid.UUID) -> TaskStatus:
    status = db.get(TaskStatus, status_id)
    if status is None or status.organization_id != org_id:
        raise NotFound("Status not found.")
    return status


def get_task(db: DbSession, org_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.organization_id != org_id:
        raise NotFound("Task not found.")
    return task


def create_task(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    *,
    title: str,
    description: str | None = None,
    status_id: uuid.UUID | None = None,
    priority: str = Priority.NONE,
    assignee_id: uuid.UUID | None = None,
    project_task_group_id: uuid.UUID | None = None,
    due_date=None,
    start_date=None,
) -> Task:
    proj = get_project(db, org_id, project_id)
    authz.require_role(
        db, user_id, org_id, Role.MEMBER, team_id=proj.team_id, project_id=proj.id
    )

    if priority not in Priority.ALL:
        raise BadRequest(f"Invalid priority: {priority}")

    if status_id is not None:
        status = _get_status(db, org_id, status_id)
    else:
        status = _default_status(db, org_id)

    if project_task_group_id is not None:
        ptg = db.get(ProjectTaskGroup, project_task_group_id)
        if ptg is None or ptg.project_id != proj.id:
            raise NotFound("Task group not found in this project.")

    task = Task(
        organization_id=org_id,
        project_id=proj.id,
        project_task_group_id=project_task_group_id,
        title=title,
        description=description,
        status_id=status.id if status else None,
        priority=priority,
        assignee_id=assignee_id,
        created_by=user_id,
        start_date=start_date,
        due_date=due_date,
    )
    if status is not None and status.is_completed:
        task.completed_at = utcnow()
    db.add(task)
    db.flush()

    audit.activity(db, org_id=org_id, task_id=task.id, actor_id=user_id, verb="created")
    audit.record(
        db,
        org_id=org_id,
        actor_id=user_id,
        action="task.create",
        target_type="task",
        target_id=task.id,
        data={"project_id": str(proj.id), "title": title},
    )
    if assignee_id and assignee_id != user_id:
        notification_service.notify(
            db, org_id=org_id, recipient_id=assignee_id,
            type_="task_assigned", ref_type="task", ref_id=task.id,
        )
    db.flush()
    return task


def list_tasks(db: DbSession, org_id: uuid.UUID, project_id: uuid.UUID) -> list[Task]:
    get_project(db, org_id, project_id)  # 404 if not in org
    return list(
        db.scalars(
            select(Task)
            .where(Task.project_id == project_id)
            .order_by(Task.rank.nulls_last(), Task.created_at)
        )
    )


_UPDATABLE = {
    "title", "description", "status_id", "priority",
    "assignee_id", "project_task_group_id", "start_date", "due_date",
}
# Fields that must always hold a value (null in a PATCH is ignored for these).
_NON_NULLABLE = {"title", "priority"}


def update_task(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    task_id: uuid.UUID,
    changes: dict[str, Any],
) -> Task:
    task = get_task(db, org_id, task_id)
    proj = get_project(db, org_id, task.project_id)
    authz.require_role(
        db, user_id, org_id, Role.MEMBER, team_id=proj.team_id, project_id=proj.id
    )

    applied: dict[str, Any] = {}
    for field, value in changes.items():
        if field not in _UPDATABLE:
            continue
        # title/priority can't be cleared; other fields may be set to null
        # (e.g. move to "Ungrouped", unassign, clear a date, no status).
        if value is None and field in _NON_NULLABLE:
            continue
        if field == "priority" and value not in Priority.ALL:
            raise BadRequest(f"Invalid priority: {value}")
        if field == "status_id":
            if value is not None:
                status = _get_status(db, org_id, value)
                task.completed_at = utcnow() if status.is_completed else None
            else:
                task.completed_at = None
        if field == "project_task_group_id" and value is not None:
            ptg = db.get(ProjectTaskGroup, value)
            if ptg is None or ptg.project_id != proj.id:
                raise NotFound("Task group not found in this project.")
        setattr(task, field, value)
        applied[field] = str(value)

    if applied:
        audit.activity(
            db, org_id=org_id, task_id=task.id, actor_id=user_id,
            verb="updated", data={"fields": list(applied.keys())},
        )
        audit.record(
            db, org_id=org_id, actor_id=user_id, action="task.update",
            target_type="task", target_id=task.id, data=applied,
        )
        if "assignee_id" in applied and task.assignee_id and task.assignee_id != user_id:
            notification_service.notify(
                db, org_id=org_id, recipient_id=task.assignee_id,
                type_="task_assigned", ref_type="task", ref_id=task.id,
            )
    db.flush()
    return task


def reorder_tasks(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    group_id: uuid.UUID | None,
    task_ids: list[uuid.UUID],
) -> list[Task]:
    """Set the order of `task_ids` within `group_id`, assigning sequential ranks.
    Also (re)assigns each listed task to `group_id`, so this covers both
    reordering within a section and dropping a task into a section at a position."""
    proj = get_project(db, org_id, project_id)
    authz.require_role(
        db, user_id, org_id, Role.MEMBER, team_id=proj.team_id, project_id=proj.id
    )
    if group_id is not None:
        ptg = db.get(ProjectTaskGroup, group_id)
        if ptg is None or ptg.project_id != proj.id:
            raise NotFound("Task group not found in this project.")

    by_id = {t.id: t for t in db.scalars(select(Task).where(Task.project_id == proj.id))}
    for i, tid in enumerate(task_ids):
        t = by_id.get(tid)
        if t is None:
            raise NotFound(f"Task {tid} is not in this project.")
        t.project_task_group_id = group_id
        t.rank = f"{i:06d}"

    audit.record(
        db,
        org_id=org_id,
        actor_id=user_id,
        action="task.reorder",
        target_type="project",
        target_id=proj.id,
        data={"group_id": str(group_id) if group_id else None, "count": len(task_ids)},
    )
    db.flush()
    return list_tasks(db, org_id, project_id)


def delete_task(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, task_id: uuid.UUID, confirm: bool
) -> None:
    # Destructive: REST requires an explicit confirm flag from ANY caller.
    if not confirm:
        raise BadRequest("This action requires confirm=true.", code="confirmation_required")

    task = get_task(db, org_id, task_id)
    proj = get_project(db, org_id, task.project_id)
    # Deletion needs elevated permission (Admin+), or being the task's creator.
    role = authz.effective_role(
        db, user_id, org_id, team_id=proj.team_id, project_id=proj.id
    )
    is_creator = task.created_by == user_id
    if role is None or (Role.RANK.get(role, 0) < Role.RANK[Role.ADMIN] and not is_creator):
        raise Forbidden("You do not have permission to delete this task.")

    audit.record(
        db, org_id=org_id, actor_id=user_id, action="task.delete",
        target_type="task", target_id=task.id, data={"title": task.title},
    )
    db.delete(task)
    db.flush()
