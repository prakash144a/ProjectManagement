"""Project creation + listing. Attaches the org's default task groups on create."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.errors import BadRequest, NotFound
from app.models.enums import GroupType, Role
from app.models.identity import Group
from app.models.work import Project, ProjectTaskGroup, TaskGroupDefinition
from app.services import audit, authz


def _get_team(db: DbSession, org_id: uuid.UUID, team_id: uuid.UUID) -> Group:
    team = db.get(Group, team_id)
    if team is None or team.organization_id != org_id:
        raise NotFound("Team not found.")
    if team.type != GroupType.TEAM:
        raise BadRequest("Projects can only be created under a team, not a group.")
    return team


def get_project(db: DbSession, org_id: uuid.UUID, project_id: uuid.UUID) -> Project:
    proj = db.get(Project, project_id)
    if proj is None or proj.organization_id != org_id:
        raise NotFound("Project not found.")
    return proj


def create_project(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    team_id: uuid.UUID,
    name: str,
    description: str | None,
) -> Project:
    team = _get_team(db, org_id, team_id)
    authz.require_role(db, user_id, org_id, Role.MEMBER, team_id=team.id)

    proj = Project(
        organization_id=org_id,
        team_id=team.id,
        name=name,
        description=description,
        created_by=user_id,
    )
    db.add(proj)
    db.flush()

    # Attach the org's default task-group definitions.
    defaults = db.scalars(
        select(TaskGroupDefinition)
        .where(
            TaskGroupDefinition.organization_id == org_id,
            TaskGroupDefinition.is_default.is_(True),
        )
        .order_by(TaskGroupDefinition.position)
    ).all()
    for d in defaults:
        db.add(
            ProjectTaskGroup(
                organization_id=org_id,
                project_id=proj.id,
                definition_id=d.id,
                name=d.name,
                position=d.position,
            )
        )

    # No per-project grants: the team's members inherit access via the
    # team-scoped grant (see grants.sync_membership_grant).
    audit.record(
        db,
        org_id=org_id,
        actor_id=user_id,
        action="project.create",
        target_type="project",
        target_id=proj.id,
        data={"name": name, "team_id": str(team.id)},
    )
    db.flush()
    return proj


def create_task_group(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    name: str,
) -> ProjectTaskGroup:
    """Add an ad-hoc task-group section to a project (no org-catalog entry).
    Owner-managed catalog definitions come with the Settings screens later."""
    proj = get_project(db, org_id, project_id)
    authz.require_role(
        db, user_id, org_id, Role.MEMBER, team_id=proj.team_id, project_id=proj.id
    )

    max_pos = db.scalar(
        select(func.coalesce(func.max(ProjectTaskGroup.position), -1)).where(
            ProjectTaskGroup.project_id == proj.id
        )
    )
    ptg = ProjectTaskGroup(
        organization_id=org_id,
        project_id=proj.id,
        definition_id=None,
        name=name,
        position=(max_pos or 0) + 1,
    )
    db.add(ptg)
    db.flush()

    audit.record(
        db,
        org_id=org_id,
        actor_id=user_id,
        action="task_group.create",
        target_type="project_task_group",
        target_id=ptg.id,
        data={"name": name, "project_id": str(proj.id)},
    )
    db.flush()
    return ptg


def list_projects(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    team_id: uuid.UUID | None = None,
) -> list[Project]:
    """Projects the user can actually reach — team members inherit the team's
    projects; others see only projects granted to them directly."""
    stmt = select(Project).where(Project.organization_id == org_id)
    if team_id is not None:
        stmt = stmt.where(Project.team_id == team_id)
    projects = list(db.scalars(stmt.order_by(Project.created_at)))
    return [
        p
        for p in projects
        if authz.effective_role(db, user_id, org_id, team_id=p.team_id, project_id=p.id)
        is not None
    ]
