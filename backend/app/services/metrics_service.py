"""Read-only metrics: a user's cross-project task view and an org dashboard.

Pure aggregation over already-tenant-scoped data (RLS + an explicit org filter);
no mutations, so no audit. Authorization: *my-tasks* is self-scoped (you only ever
see tasks assigned to you), so it needs no role check beyond org membership. The
*dashboard* is org-level by default (aggregating every project the caller can
reach) and can be narrowed to a team or a single project — each narrowing is
access-checked.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.db.base import utcnow
from app.errors import BadRequest, Forbidden, NotFound
from app.models.enums import GroupType, Role
from app.models.identity import Group, GroupMembership, OrgMembership
from app.models.work import Project, Task, TaskStatus
from app.services import authz, project_service


def my_tasks(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID
) -> list[tuple[Task, str, str, uuid.UUID]]:
    """Tasks assigned to the current user across every project in this org, each
    paired with its project name, team name, and team id (for client-side filters)."""
    rows = db.execute(
        select(Task, Project.name, Group.name, Group.id)
        .join(Project, Task.project_id == Project.id)
        .join(Group, Project.team_id == Group.id)
        .where(Task.organization_id == org_id, Task.assignee_id == user_id)
        .order_by(Task.due_date.nulls_last(), Task.created_at)
    ).all()
    return [(t, project_name, team_name, team_id) for (t, project_name, team_name, team_id) in rows]


def _is_done(task: Task) -> bool:
    # completed_at is stamped whenever a task enters an is_completed status.
    return task.completed_at is not None


def _resolve_scope(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    team_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> tuple[list[Project], str, set[uuid.UUID] | None]:
    """Included projects + a scope label + the team ids whose members to count
    (None → count org members instead)."""
    if project_id is not None:
        proj = db.get(Project, project_id)
        if proj is None or proj.organization_id != org_id:
            raise NotFound("Project not found.")
        if (
            authz.effective_role(
                db, user_id, org_id, team_id=proj.team_id, project_id=proj.id
            )
            is None
        ):
            raise Forbidden("You do not have access to this project.")
        return [proj], proj.name, {proj.team_id}

    if team_id is not None:
        team = db.get(Group, team_id)
        if team is None or team.organization_id != org_id:
            raise NotFound("Team not found.")
        if team.type != GroupType.TEAM:
            raise BadRequest("A dashboard is only available for a team, not a group.")
        authz.require_role(db, user_id, org_id, Role.VIEWER, team_id=team_id)
        projects = list(
            db.scalars(
                select(Project)
                .where(Project.team_id == team_id)
                .order_by(Project.created_at)
            )
        )
        return projects, team.name, {team_id}

    # Org-level: every project the caller can reach.
    projects = project_service.list_projects(db, user_id, org_id)
    return projects, "All teams", None


def dashboard(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    *,
    team_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
) -> dict:
    """Aggregate KPIs across the resolved scope: project health, task rollups, and
    4-week throughput."""
    projects, scope_label, member_team_ids = _resolve_scope(
        db, user_id, org_id, team_id, project_id
    )

    if member_team_ids is None:
        member_count = (
            db.scalar(
                select(func.count())
                .select_from(OrgMembership)
                .where(OrgMembership.organization_id == org_id)
            )
            or 0
        )
    else:
        member_count = (
            db.scalar(
                select(func.count(func.distinct(GroupMembership.user_id))).where(
                    GroupMembership.group_id.in_(member_team_ids)
                )
            )
            or 0
        )

    proj_ids = [p.id for p in projects]
    tasks = (
        list(db.scalars(select(Task).where(Task.project_id.in_(proj_ids))))
        if proj_ids
        else []
    )
    statuses = list(
        db.scalars(
            select(TaskStatus)
            .where(TaskStatus.organization_id == org_id)
            .order_by(TaskStatus.position)
        )
    )

    today = utcnow().date()
    week_end = today + timedelta(days=6)

    def is_overdue(t: Task) -> bool:
        return t.due_date is not None and t.due_date < today and not _is_done(t)

    def is_due_this_week(t: Task) -> bool:
        return (
            t.due_date is not None
            and today <= t.due_date <= week_end
            and not _is_done(t)
        )

    total_tasks = len(tasks)
    done = sum(1 for t in tasks if _is_done(t))
    overdue_total = sum(1 for t in tasks if is_overdue(t))
    due_week_total = sum(1 for t in tasks if is_due_this_week(t))

    # Tasks by status, in catalog order, plus a synthetic "No status" bucket.
    by_status_count: dict[uuid.UUID | None, int] = {}
    for t in tasks:
        by_status_count[t.status_id] = by_status_count.get(t.status_id, 0) + 1
    tasks_by_status = [
        {
            "status_id": s.id,
            "name": s.name,
            "color": s.color,
            "is_completed": s.is_completed,
            "count": by_status_count.get(s.id, 0),
        }
        for s in statuses
    ]
    if by_status_count.get(None):
        tasks_by_status.append(
            {
                "status_id": None,
                "name": "No status",
                "color": None,
                "is_completed": False,
                "count": by_status_count[None],
            }
        )

    # Throughput: tasks completed per week over the last 4 ISO weeks (Mon-start).
    this_monday = today - timedelta(days=today.weekday())
    week_starts = [this_monday - timedelta(weeks=i) for i in range(3, -1, -1)]
    per_week = {ws: 0 for ws in week_starts}
    earliest = week_starts[0]
    for t in tasks:
        if t.completed_at is None:
            continue
        d = t.completed_at.date()
        if d < earliest:
            continue
        ws = d - timedelta(days=d.weekday())
        if ws in per_week:
            per_week[ws] += 1
    throughput = [{"week_start": ws, "count": per_week[ws]} for ws in week_starts]

    # Per-project rollup + health signal.
    tasks_by_project: dict[uuid.UUID, list[Task]] = {}
    for t in tasks:
        tasks_by_project.setdefault(t.project_id, []).append(t)
    project_rows = []
    for p in projects:
        pts = tasks_by_project.get(p.id, [])
        p_count = len(pts)
        p_done = sum(1 for t in pts if _is_done(t))
        p_overdue = sum(1 for t in pts if is_overdue(t))
        p_due_week = sum(1 for t in pts if is_due_this_week(t))
        if p_overdue > 0:
            health = "overdue"
        elif p_due_week > 0:
            health = "at_risk"
        else:
            health = "on_track"
        project_rows.append(
            {
                "id": p.id,
                "name": p.name,
                "task_count": p_count,
                "done_count": p_done,
                "completion_rate": round(p_done / p_count, 4) if p_count else 0.0,
                "overdue_count": p_overdue,
                "due_this_week": p_due_week,
                "health": health,
            }
        )

    return {
        "scope_label": scope_label,
        "member_count": member_count,
        "total_projects": len(projects),
        "total_tasks": total_tasks,
        "tasks_completed": done,
        "completion_rate": round(done / total_tasks, 4) if total_tasks else 0.0,
        "overdue": overdue_total,
        "due_this_week": due_week_total,
        "tasks_by_status": tasks_by_status,
        "throughput": throughput,
        "projects": project_rows,
    }
