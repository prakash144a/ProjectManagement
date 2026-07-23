"""Project-scope access grants (the project Security tab).

Grants use the same AccessGrant model at project scope. Project security is
managed by Admins (org Admin/Owner, or anyone granted Admin reaching the
project). Owner is an org-level role, so it is not offered at project scope.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.errors import BadRequest, NotFound
from app.models.enums import PrincipalType, Role, ScopeType
from app.models.identity import AccessGrant, Group, User
from app.services import audit, authz
from app.services.project_service import get_project

_PROJECT_ROLES = (Role.ADMIN, Role.MEMBER, Role.VIEWER)


def list_groups(db: DbSession, org_id: uuid.UUID) -> list[Group]:
    return list(
        db.scalars(
            select(Group).where(Group.organization_id == org_id).order_by(Group.name)
        )
    )


def _principal_name(db: DbSession, g: AccessGrant) -> str | None:
    if g.principal_type == PrincipalType.USER and g.principal_user_id:
        u = db.get(User, g.principal_user_id)
        return u and (u.display_name or u.username or u.email or u.mobile)
    if g.principal_type == PrincipalType.GROUP and g.principal_group_id:
        grp = db.get(Group, g.principal_group_id)
        return grp and grp.name
    return None


def list_project_grants(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, project_id: uuid.UUID
) -> list[tuple[AccessGrant, str | None]]:
    proj = get_project(db, org_id, project_id)
    authz.require_role(
        db, user_id, org_id, Role.VIEWER, team_id=proj.team_id, project_id=proj.id
    )
    grants = db.scalars(
        select(AccessGrant).where(
            AccessGrant.organization_id == org_id,
            AccessGrant.scope_type == ScopeType.PROJECT,
            AccessGrant.scope_project_id == project_id,
        )
    ).all()
    return [(g, _principal_name(db, g)) for g in grants]


def add_project_grant(
    db: DbSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    *,
    principal_type: str,
    principal_id: uuid.UUID,
    role: str,
) -> tuple[AccessGrant, str | None]:
    proj = get_project(db, org_id, project_id)
    authz.require_role(
        db, user_id, org_id, Role.ADMIN, team_id=proj.team_id, project_id=proj.id
    )
    if role not in _PROJECT_ROLES:
        raise BadRequest(f"Role must be one of {_PROJECT_ROLES} at project scope.")

    if principal_type == PrincipalType.USER:
        if not authz.is_org_member(db, principal_id, org_id):
            raise NotFound("User is not a member of this organization.")
        principal_col = AccessGrant.principal_user_id
    elif principal_type == PrincipalType.GROUP:
        grp = db.get(Group, principal_id)
        if grp is None or grp.organization_id != org_id:
            raise NotFound("Group not found in this organization.")
        principal_col = AccessGrant.principal_group_id
    else:
        raise BadRequest("principal_type must be 'user' or 'group'.")

    # Upsert: one grant per principal at this project scope.
    existing = db.scalars(
        select(AccessGrant).where(
            AccessGrant.organization_id == org_id,
            AccessGrant.scope_type == ScopeType.PROJECT,
            AccessGrant.scope_project_id == project_id,
            AccessGrant.principal_type == principal_type,
            principal_col == principal_id,
        )
    ).first()
    if existing is not None:
        existing.role = role
        grant = existing
    else:
        grant = AccessGrant(
            organization_id=org_id,
            principal_type=principal_type,
            principal_user_id=principal_id if principal_type == PrincipalType.USER else None,
            principal_group_id=principal_id if principal_type == PrincipalType.GROUP else None,
            scope_type=ScopeType.PROJECT,
            scope_project_id=project_id,
            role=role,
        )
        db.add(grant)
    db.flush()
    audit.record(
        db, org_id=org_id, actor_id=user_id, action="project_grant.set",
        target_type="project", target_id=project_id,
        data={"principal_type": principal_type, "principal_id": str(principal_id), "role": role},
    )
    db.flush()
    return grant, _principal_name(db, grant)


def delete_project_grant(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, project_id: uuid.UUID, grant_id: uuid.UUID
) -> None:
    proj = get_project(db, org_id, project_id)
    authz.require_role(
        db, user_id, org_id, Role.ADMIN, team_id=proj.team_id, project_id=proj.id
    )
    g = db.get(AccessGrant, grant_id)
    if (
        g is None
        or g.organization_id != org_id
        or g.scope_type != ScopeType.PROJECT
        or g.scope_project_id != project_id
    ):
        raise NotFound("Grant not found on this project.")
    db.delete(g)
    db.flush()
