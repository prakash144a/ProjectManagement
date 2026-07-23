"""Task and project comments (kept separate per the data model)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.errors import Forbidden, NotFound
from app.models.collab import ProjectComment, TaskComment
from app.models.enums import Role
from app.models.identity import User
from app.services import audit, authz
from app.services.project_service import get_project
from app.services.task_service import get_task


def _display(u: User | None) -> str | None:
    if u is None:
        return None
    return u.display_name or u.username or u.email or u.mobile


# --- Task comments ---

def list_task_comments(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, task_id: uuid.UUID
) -> list[tuple[TaskComment, str | None]]:
    task = get_task(db, org_id, task_id)
    proj = get_project(db, org_id, task.project_id)
    authz.require_role(
        db, user_id, org_id, Role.VIEWER, team_id=proj.team_id, project_id=proj.id
    )
    rows = db.execute(
        select(TaskComment, User)
        .join(User, User.id == TaskComment.author_id, isouter=True)
        .where(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at)
    ).all()
    return [(c, _display(u)) for c, u in rows]


def add_task_comment(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, task_id: uuid.UUID, body: str
) -> tuple[TaskComment, str | None]:
    task = get_task(db, org_id, task_id)
    proj = get_project(db, org_id, task.project_id)
    authz.require_role(
        db, user_id, org_id, Role.MEMBER, team_id=proj.team_id, project_id=proj.id
    )
    c = TaskComment(organization_id=org_id, task_id=task_id, author_id=user_id, body=body)
    db.add(c)
    db.flush()
    audit.activity(db, org_id=org_id, task_id=task_id, actor_id=user_id, verb="commented")
    # Notify the assignee (if someone else) — see notifications service.
    from app.services import notification_service

    if task.assignee_id and task.assignee_id != user_id:
        notification_service.notify(
            db, org_id=org_id, recipient_id=task.assignee_id,
            type_="task_comment", ref_type="task", ref_id=task_id,
        )
    db.flush()
    return c, _display(db.get(User, user_id))


def delete_task_comment(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, comment_id: uuid.UUID
) -> None:
    c = db.get(TaskComment, comment_id)
    if c is None or c.organization_id != org_id:
        raise NotFound("Comment not found.")
    task = get_task(db, org_id, c.task_id)
    proj = get_project(db, org_id, task.project_id)
    role = authz.effective_role(
        db, user_id, org_id, team_id=proj.team_id, project_id=proj.id
    )
    if c.author_id != user_id and (role is None or Role.RANK.get(role, 0) < Role.RANK[Role.ADMIN]):
        raise Forbidden("You can only delete your own comments.")
    db.delete(c)
    db.flush()


# --- Project comments ---

def list_project_comments(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, project_id: uuid.UUID
) -> list[tuple[ProjectComment, str | None]]:
    proj = get_project(db, org_id, project_id)
    authz.require_role(
        db, user_id, org_id, Role.VIEWER, team_id=proj.team_id, project_id=proj.id
    )
    rows = db.execute(
        select(ProjectComment, User)
        .join(User, User.id == ProjectComment.author_id, isouter=True)
        .where(ProjectComment.project_id == project_id)
        .order_by(ProjectComment.created_at)
    ).all()
    return [(c, _display(u)) for c, u in rows]


def add_project_comment(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, project_id: uuid.UUID, body: str
) -> tuple[ProjectComment, str | None]:
    proj = get_project(db, org_id, project_id)
    authz.require_role(
        db, user_id, org_id, Role.MEMBER, team_id=proj.team_id, project_id=proj.id
    )
    c = ProjectComment(
        organization_id=org_id, project_id=project_id, author_id=user_id, body=body
    )
    db.add(c)
    db.flush()
    return c, _display(db.get(User, user_id))


def delete_project_comment(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, comment_id: uuid.UUID
) -> None:
    c = db.get(ProjectComment, comment_id)
    if c is None or c.organization_id != org_id:
        raise NotFound("Comment not found.")
    proj = get_project(db, org_id, c.project_id)
    role = authz.effective_role(
        db, user_id, org_id, team_id=proj.team_id, project_id=proj.id
    )
    if c.author_id != user_id and (role is None or Role.RANK.get(role, 0) < Role.RANK[Role.ADMIN]):
        raise Forbidden("You can only delete your own comments.")
    db.delete(c)
    db.flush()
