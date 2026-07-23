"""Organization creation + listing.

Creating an org bootstraps the tenant: the creator becomes Owner, a default team
+ its team-group are created, and the org-level catalogs (statuses, task-group
definitions) are seeded.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.db.session import set_current_org
from app.models.enums import GroupType, MemberRole, PrincipalType, Role, ScopeType
from app.models.identity import (
    AccessGrant,
    Group,
    GroupMembership,
    OrgMembership,
    Organization,
)
from app.models.work import TaskGroupDefinition, TaskStatus
from app.services import audit, grants

# (name, is_completed, is_default)
_DEFAULT_STATUSES = [
    ("To Do", False, True),
    ("In Progress", False, False),
    ("Blocked", False, False),
    ("Done", True, False),
    ("Cancelled", False, False),
]

# (name, is_default)
_DEFAULT_TASK_GROUPS = [
    ("General", True),
    ("Backlog", False),
]

_DEFAULT_TEAM_NAME = "General"


def create_org(db: DbSession, user_id: uuid.UUID, name: str) -> Organization:
    org = Organization(name=name)
    db.add(org)
    db.flush()  # get org.id (WITH CHECK (true) allows the insert)

    # From here on, org-scoped inserts must match the RLS org context.
    set_current_org(db, org.id)

    db.add(OrgMembership(organization_id=org.id, user_id=user_id))

    # A default team (type=team) so the org has a project container immediately;
    # the creator is its owner.
    team = Group(organization_id=org.id, name=_DEFAULT_TEAM_NAME, type=GroupType.TEAM, created_by=user_id)
    db.add(team)
    db.flush()
    db.add(
        GroupMembership(
            organization_id=org.id, group_id=team.id, user_id=user_id, role=MemberRole.OWNER
        )
    )
    grants.sync_membership_grant(
        db, org_id=org.id, team_id=team.id, user_id=user_id, member_role=MemberRole.OWNER
    )

    # Creator becomes Owner at org scope.
    db.add(
        AccessGrant(
            organization_id=org.id,
            principal_type=PrincipalType.USER,
            principal_user_id=user_id,
            scope_type=ScopeType.ORG,
            scope_org_id=org.id,
            role=Role.OWNER,
        )
    )

    for pos, (sname, is_completed, is_default) in enumerate(_DEFAULT_STATUSES):
        db.add(
            TaskStatus(
                organization_id=org.id,
                name=sname,
                position=pos,
                is_completed=is_completed,
                is_default=is_default,
            )
        )

    for pos, (gname, is_default) in enumerate(_DEFAULT_TASK_GROUPS):
        db.add(
            TaskGroupDefinition(
                organization_id=org.id,
                name=gname,
                is_default=is_default,
                position=pos,
            )
        )

    audit.record(
        db,
        org_id=org.id,
        actor_id=user_id,
        action="org.create",
        target_type="organization",
        target_id=org.id,
        data={"name": name},
    )
    db.flush()
    return org


def list_orgs(db: DbSession, user_id: uuid.UUID) -> list[Organization]:
    return list(
        db.scalars(
            select(Organization)
            .join(OrgMembership, OrgMembership.organization_id == Organization.id)
            .where(OrgMembership.user_id == user_id)
            .order_by(Organization.created_at)
        )
    )
