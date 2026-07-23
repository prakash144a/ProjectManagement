"""Keep team membership in sync with the AccessGrant that actually confers access.

AccessGrant remains the single permission mechanism. A user's membership in a
`type=team` group is mirrored to a **team-scoped** grant (owner→OWNER,
member→MEMBER), so `authz` needs no special-casing. `type=group` groups are
permission-only: membership confers nothing until the group is granted to a
project via Security, so they get no membership grant here.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models.enums import MemberRole, PrincipalType, Role, ScopeType
from app.models.identity import AccessGrant

_ROLE_FOR = {MemberRole.OWNER: Role.OWNER, MemberRole.MEMBER: Role.MEMBER}


def _team_grant(
    db: DbSession, org_id: uuid.UUID, team_id: uuid.UUID, user_id: uuid.UUID
) -> AccessGrant | None:
    return db.scalars(
        select(AccessGrant).where(
            AccessGrant.organization_id == org_id,
            AccessGrant.principal_type == PrincipalType.USER,
            AccessGrant.principal_user_id == user_id,
            AccessGrant.scope_type == ScopeType.TEAM,
            AccessGrant.scope_team_id == team_id,
        )
    ).first()


def sync_membership_grant(
    db: DbSession,
    *,
    org_id: uuid.UUID,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    member_role: str,
) -> None:
    """Upsert the team-scoped grant for a member of a `type=team` group."""
    role = _ROLE_FOR.get(member_role, Role.MEMBER)
    grant = _team_grant(db, org_id, team_id, user_id)
    if grant is not None:
        grant.role = role
    else:
        db.add(
            AccessGrant(
                organization_id=org_id,
                principal_type=PrincipalType.USER,
                principal_user_id=user_id,
                scope_type=ScopeType.TEAM,
                scope_team_id=team_id,
                role=role,
            )
        )
    db.flush()


def remove_membership_grant(
    db: DbSession, *, org_id: uuid.UUID, team_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    grant = _team_grant(db, org_id, team_id, user_id)
    if grant is not None:
        db.delete(grant)
        db.flush()
