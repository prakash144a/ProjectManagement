"""Authorization — the single source of the 'can this user do this?' decision.

Effective role at an object = the most permissive role among all AccessGrants
that reach the user (their own grants + their groups' grants) at the object's
scope or any ancestor scope (project → team → org). Additive union.

The caller must have set the org RLS context first (grants/memberships are
org-scoped), so every query here is already tenant-filtered.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.errors import Forbidden
from app.models.enums import PrincipalType, Role, ScopeType
from app.models.identity import AccessGrant, GroupMembership, OrgMembership
from app.models.work import Project


def _user_group_ids(db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(GroupMembership.group_id).where(
                GroupMembership.user_id == user_id,
                GroupMembership.organization_id == org_id,
            )
        )
    )


def is_org_member(db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID) -> bool:
    return (
        db.scalars(
            select(OrgMembership.id).where(
                OrgMembership.user_id == user_id,
                OrgMembership.organization_id == org_id,
            )
        ).first()
        is not None
    )


def effective_role(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    *,
    team_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
) -> str | None:
    """Most-permissive role reaching the user at the given object, or None."""
    group_ids = _user_group_ids(db, user_id, org_id)

    principal_clause = AccessGrant.principal_user_id == user_id
    if group_ids:
        principal_clause = principal_clause | (
            (AccessGrant.principal_type == PrincipalType.GROUP)
            & AccessGrant.principal_group_id.in_(group_ids)
        )

    # Scope coverage. An org grant covers the whole org — but only org *managers*
    # (Admin/Owner) inherit down to every team/project. A plain org Member/Viewer
    # grant conveys org membership, not blanket project access, so when resolving
    # a specific team/project it does NOT reach down; access there must come from a
    # team- or project-scoped grant (team membership or a Security grant).
    checking_object = team_id is not None or project_id is not None
    org_clause = (AccessGrant.scope_type == ScopeType.ORG) & (
        AccessGrant.scope_org_id == org_id
    )
    if checking_object:
        org_clause = org_clause & AccessGrant.role.in_([Role.ADMIN, Role.OWNER])

    scope_clause = org_clause
    if team_id is not None:
        scope_clause = scope_clause | (
            (AccessGrant.scope_type == ScopeType.TEAM)
            & (AccessGrant.scope_team_id == team_id)
        )
    if project_id is not None:
        scope_clause = scope_clause | (
            (AccessGrant.scope_type == ScopeType.PROJECT)
            & (AccessGrant.scope_project_id == project_id)
        )

    roles = db.scalars(
        select(AccessGrant.role).where(
            AccessGrant.organization_id == org_id, principal_clause, scope_clause
        )
    ).all()
    if not roles:
        return None
    return max(roles, key=lambda r: Role.RANK.get(r, 0))


def require_role(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    needed: str,
    *,
    team_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
) -> str:
    role = effective_role(
        db, user_id, org_id, team_id=team_id, project_id=project_id
    )
    if role is None or Role.RANK.get(role, 0) < Role.RANK[needed]:
        raise Forbidden("You do not have permission to perform this action.")
    return role


def project_scope(db: DbSession, project: Project) -> dict:
    """Convenience: the team/project ids needed for a project-scoped check."""
    return {"team_id": project.team_id, "project_id": project.id}
