"""Org-level status catalog management (Admin/Owner). The design notes this as
Owner-managed; we allow Admin+ for consistency with the other org catalogs."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.errors import BadRequest, NotFound
from app.models.enums import Role
from app.models.work import TaskStatus
from app.services import audit, authz


def _get(db: DbSession, org_id: uuid.UUID, status_id: uuid.UUID) -> TaskStatus:
    s = db.get(TaskStatus, status_id)
    if s is None or s.organization_id != org_id:
        raise NotFound("Status not found.")
    return s


def _clear_defaults(db: DbSession, org_id: uuid.UUID, keep_id: uuid.UUID | None) -> None:
    for s in db.scalars(
        select(TaskStatus).where(
            TaskStatus.organization_id == org_id, TaskStatus.is_default.is_(True)
        )
    ):
        if s.id != keep_id:
            s.is_default = False


def create_status(
    db: DbSession,
    actor_id: uuid.UUID,
    org_id: uuid.UUID,
    *,
    name: str,
    color: str | None,
    is_completed: bool,
    is_default: bool = False,
) -> TaskStatus:
    authz.require_role(db, actor_id, org_id, Role.ADMIN)
    max_pos = db.scalar(
        select(func.coalesce(func.max(TaskStatus.position), -1)).where(
            TaskStatus.organization_id == org_id
        )
    )
    if is_default:
        _clear_defaults(db, org_id, None)
    s = TaskStatus(
        organization_id=org_id,
        name=name,
        color=color,
        is_completed=is_completed,
        is_default=is_default,
        position=(max_pos or 0) + 1,
    )
    db.add(s)
    db.flush()
    audit.record(
        db, org_id=org_id, actor_id=actor_id, action="status.create",
        target_type="task_status", target_id=s.id, data={"name": name},
    )
    db.flush()
    return s


def update_status(
    db: DbSession,
    actor_id: uuid.UUID,
    org_id: uuid.UUID,
    status_id: uuid.UUID,
    *,
    name: str | None = None,
    color: str | None = None,
    is_completed: bool | None = None,
    is_default: bool | None = None,
) -> TaskStatus:
    authz.require_role(db, actor_id, org_id, Role.ADMIN)
    s = _get(db, org_id, status_id)
    if name is not None:
        s.name = name
    if color is not None:
        s.color = color or None
    if is_completed is not None:
        s.is_completed = is_completed
    if is_default is not None:
        if is_default:
            _clear_defaults(db, org_id, keep_id=s.id)
        s.is_default = is_default
    db.flush()
    audit.record(
        db, org_id=org_id, actor_id=actor_id, action="status.update",
        target_type="task_status", target_id=s.id,
    )
    db.flush()
    return s


def delete_status(
    db: DbSession, actor_id: uuid.UUID, org_id: uuid.UUID, status_id: uuid.UUID, confirm: bool
) -> None:
    if not confirm:
        raise BadRequest("This action requires confirm=true.", code="confirmation_required")
    authz.require_role(db, actor_id, org_id, Role.ADMIN)
    count = db.scalar(
        select(func.count()).where(TaskStatus.organization_id == org_id)
    )
    if (count or 0) <= 1:
        raise BadRequest("An organization must keep at least one status.")
    s = _get(db, org_id, status_id)
    audit.record(
        db, org_id=org_id, actor_id=actor_id, action="status.delete",
        target_type="task_status", target_id=s.id, data={"name": s.name},
    )
    db.delete(s)  # tasks referencing it have status_id set to NULL
    db.flush()


def reorder_statuses(
    db: DbSession, actor_id: uuid.UUID, org_id: uuid.UUID, ordered_ids: list[uuid.UUID]
) -> list[TaskStatus]:
    authz.require_role(db, actor_id, org_id, Role.ADMIN)
    statuses = {
        s.id: s
        for s in db.scalars(
            select(TaskStatus).where(TaskStatus.organization_id == org_id)
        )
    }
    for pos, sid in enumerate(ordered_ids):
        s = statuses.get(sid)
        if s is None:
            raise NotFound(f"Status {sid} not found in this organization.")
        s.position = pos
    db.flush()
    return sorted(statuses.values(), key=lambda s: s.position)
