"""Admin-provisioned users (no self-signup invites).

An org Admin/Owner creates users directly. Users are global identities, so
creation is "attach existing global user or create a new one", then grant them a
role at org scope. Role changes go through set_member_role.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.errors import BadRequest, Conflict, Forbidden, NotFound
from app.models.enums import PrincipalType, Role, ScopeType
from app.models.identity import AccessGrant, OrgMembership, User
from app.services import audit, authz


def _norm(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


def _find_existing(
    db: DbSession, email: str | None, mobile: str | None, username: str | None
) -> User | None:
    # Deterministic precedence: email > mobile > username.
    for col, val in ((User.email, email), (User.mobile, mobile), (User.username, username)):
        if val:
            u = db.scalars(select(User).where(col == val)).first()
            if u:
                return u
    return None


def _org_role_grant(db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID) -> AccessGrant | None:
    return db.scalars(
        select(AccessGrant).where(
            AccessGrant.organization_id == org_id,
            AccessGrant.principal_type == PrincipalType.USER,
            AccessGrant.principal_user_id == user_id,
            AccessGrant.scope_type == ScopeType.ORG,
            AccessGrant.scope_org_id == org_id,
        )
    ).first()


def _check_can_assign(db: DbSession, actor_id: uuid.UUID, org_id: uuid.UUID, role: str) -> None:
    if role not in Role.ALL:
        raise BadRequest(f"Invalid role: {role}")
    # Must be at least Admin to manage users.
    actor_role = authz.require_role(db, actor_id, org_id, Role.ADMIN)
    # Only an Owner may grant the Owner role.
    if role == Role.OWNER and actor_role != Role.OWNER:
        raise Forbidden("Only an Owner can assign the Owner role.")


def create_user(
    db: DbSession,
    actor_id: uuid.UUID,
    org_id: uuid.UUID,
    *,
    username: str | None,
    email: str | None,
    mobile: str | None,
    display_name: str | None,
    role: str,
) -> tuple[User, str]:
    _check_can_assign(db, actor_id, org_id, role)

    username, email, mobile, display_name = (
        _norm(username), _norm(email), _norm(mobile), _norm(display_name)
    )
    if not (email or mobile):
        raise BadRequest("Provide an email or mobile number for OTP delivery.")

    user = _find_existing(db, email, mobile, username)
    if user is not None:
        if authz.is_org_member(db, user.id, org_id):
            raise Conflict("That user is already in this organization.")
        # Attach the existing global identity (don't overwrite their fields).
    else:
        user = User(
            username=username, email=email, mobile=mobile, display_name=display_name
        )
        db.add(user)
        db.flush()

    db.add(OrgMembership(organization_id=org_id, user_id=user.id))
    db.add(
        AccessGrant(
            organization_id=org_id,
            principal_type=PrincipalType.USER,
            principal_user_id=user.id,
            scope_type=ScopeType.ORG,
            scope_org_id=org_id,
            role=role,
        )
    )
    audit.record(
        db,
        org_id=org_id,
        actor_id=actor_id,
        action="user.create",
        target_type="user",
        target_id=user.id,
        data={"role": role},
    )
    db.flush()
    return user, role


def set_member_role(
    db: DbSession, actor_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID, role: str
) -> str:
    _check_can_assign(db, actor_id, org_id, role)
    if not authz.is_org_member(db, user_id, org_id):
        raise NotFound("User is not a member of this organization.")

    grant = _org_role_grant(db, org_id, user_id)
    if grant is not None:
        # Don't allow removing the last Owner (avoids locking out the org).
        if grant.role == Role.OWNER and role != Role.OWNER:
            owners = db.scalar(
                select(func.count()).where(
                    AccessGrant.organization_id == org_id,
                    AccessGrant.principal_type == PrincipalType.USER,
                    AccessGrant.scope_type == ScopeType.ORG,
                    AccessGrant.scope_org_id == org_id,
                    AccessGrant.role == Role.OWNER,
                )
            )
            if (owners or 0) <= 1:
                raise BadRequest("The organization must keep at least one Owner.")
        grant.role = role
    else:
        db.add(
            AccessGrant(
                organization_id=org_id,
                principal_type=PrincipalType.USER,
                principal_user_id=user_id,
                scope_type=ScopeType.ORG,
                scope_org_id=org_id,
                role=role,
            )
        )
    audit.record(
        db,
        org_id=org_id,
        actor_id=actor_id,
        action="user.set_role",
        target_type="user",
        target_id=user_id,
        data={"role": role},
    )
    db.flush()
    return role


def list_members(db: DbSession, org_id: uuid.UUID) -> list[tuple[User, str | None]]:
    users = list(
        db.scalars(
            select(User)
            .join(OrgMembership, OrgMembership.user_id == User.id)
            .where(OrgMembership.organization_id == org_id)
            .order_by(User.created_at)
        )
    )
    role_rows = db.execute(
        select(AccessGrant.principal_user_id, AccessGrant.role).where(
            AccessGrant.organization_id == org_id,
            AccessGrant.principal_type == PrincipalType.USER,
            AccessGrant.scope_type == ScopeType.ORG,
            AccessGrant.scope_org_id == org_id,
        )
    ).all()
    roles = {uid: r for uid, r in role_rows}
    return [(u, roles.get(u.id)) for u in users]
