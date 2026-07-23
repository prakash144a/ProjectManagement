"""Teams & Groups — the unified people-principal (`Group`).

A `type=team` group is a project container whose members inherit access to its
projects; a `type=group` group is permission-only (grantable to a project via
Security). Membership carries an owner|member role; for teams that role is
mirrored to a team-scoped AccessGrant (see `grants.py`).

Manage rights: org Admin/Owner, or an `owner` member of the group itself.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.errors import BadRequest, Conflict, Forbidden, NotFound
from app.models.enums import GroupType, MemberRole, Role
from app.models.identity import Group, GroupMembership, User
from app.models.work import Project
from app.services import audit, authz, grants


# --- lookups -------------------------------------------------------------

def get_group(db: DbSession, org_id: uuid.UUID, group_id: uuid.UUID) -> Group:
    grp = db.get(Group, group_id)
    if grp is None or grp.organization_id != org_id:
        raise NotFound("Team or group not found.")
    return grp


def _is_owner_member(
    db: DbSession, org_id: uuid.UUID, group_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    role = db.scalar(
        select(GroupMembership.role).where(
            GroupMembership.organization_id == org_id,
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == user_id,
        )
    )
    return role == MemberRole.OWNER


def _require_manage(db: DbSession, actor_id: uuid.UUID, org_id: uuid.UUID, grp: Group) -> None:
    """Org Admin+ may manage any team/group; otherwise the actor must be an owner
    member of this one."""
    org_role = authz.effective_role(db, actor_id, org_id)
    if org_role and Role.RANK.get(org_role, 0) >= Role.RANK[Role.ADMIN]:
        return
    if _is_owner_member(db, org_id, grp.id, actor_id):
        return
    raise Forbidden("You do not have permission to manage this team.")


def _sync_if_team(db: DbSession, org_id: uuid.UUID, grp: Group, user_id: uuid.UUID, role: str) -> None:
    if grp.type == GroupType.TEAM:
        grants.sync_membership_grant(
            db, org_id=org_id, team_id=grp.id, user_id=user_id, member_role=role
        )


# --- create / list -------------------------------------------------------

def create_group(
    db: DbSession,
    actor_id: uuid.UUID,
    org_id: uuid.UUID,
    *,
    name: str,
    type: str,
    members: list[tuple[uuid.UUID, str]] | None = None,
) -> Group:
    """Create a team or group. The creator is added as an `owner` member."""
    authz.require_role(db, actor_id, org_id, Role.MEMBER)
    if type not in GroupType.ALL:
        raise BadRequest(f"type must be one of {GroupType.ALL}.")
    name = (name or "").strip()
    if not name:
        raise BadRequest("Name is required.")

    grp = Group(organization_id=org_id, name=name, type=type, created_by=actor_id)
    db.add(grp)
    db.flush()

    # Creator is always an owner member.
    db.add(
        GroupMembership(
            organization_id=org_id, group_id=grp.id, user_id=actor_id, role=MemberRole.OWNER
        )
    )
    _sync_if_team(db, org_id, grp, actor_id, MemberRole.OWNER)

    for uid, role in members or []:
        if uid == actor_id:
            continue
        _add_member_row(db, org_id, grp, uid, role)

    audit.record(
        db, org_id=org_id, actor_id=actor_id, action="group.create",
        target_type="group", target_id=grp.id, data={"name": name, "type": type},
    )
    db.flush()
    return grp


def list_groups(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, type: str | None = None
) -> list[Group]:
    """Teams/groups the user can see: those they belong to, or (for org Admin+)
    all of them."""
    stmt = select(Group).where(Group.organization_id == org_id)
    if type is not None:
        stmt = stmt.where(Group.type == type)
    all_groups = list(db.scalars(stmt.order_by(Group.name)))

    org_role = authz.effective_role(db, user_id, org_id)
    if org_role and Role.RANK.get(org_role, 0) >= Role.RANK[Role.ADMIN]:
        return all_groups

    my_group_ids = set(
        db.scalars(
            select(GroupMembership.group_id).where(
                GroupMembership.organization_id == org_id,
                GroupMembership.user_id == user_id,
            )
        )
    )
    return [g for g in all_groups if g.id in my_group_ids]


# --- members -------------------------------------------------------------

def _add_member_row(
    db: DbSession, org_id: uuid.UUID, grp: Group, user_id: uuid.UUID, role: str
) -> GroupMembership:
    if role not in MemberRole.ALL:
        raise BadRequest(f"role must be one of {MemberRole.ALL}.")
    if not authz.is_org_member(db, user_id, org_id):
        raise NotFound("User is not a member of this organization.")
    existing = db.scalars(
        select(GroupMembership).where(
            GroupMembership.organization_id == org_id,
            GroupMembership.group_id == grp.id,
            GroupMembership.user_id == user_id,
        )
    ).first()
    if existing is not None:
        raise Conflict("That user is already in this team.")
    gm = GroupMembership(
        organization_id=org_id, group_id=grp.id, user_id=user_id, role=role
    )
    db.add(gm)
    _sync_if_team(db, org_id, grp, user_id, role)
    db.flush()
    return gm


def add_member(
    db: DbSession, actor_id: uuid.UUID, org_id: uuid.UUID, group_id: uuid.UUID,
    user_id: uuid.UUID, role: str,
) -> GroupMembership:
    grp = get_group(db, org_id, group_id)
    _require_manage(db, actor_id, org_id, grp)
    gm = _add_member_row(db, org_id, grp, user_id, role)
    audit.record(
        db, org_id=org_id, actor_id=actor_id, action="group.add_member",
        target_type="group", target_id=grp.id, data={"user_id": str(user_id), "role": role},
    )
    db.flush()
    return gm


def _owner_count(db: DbSession, org_id: uuid.UUID, group_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count()).where(
            GroupMembership.organization_id == org_id,
            GroupMembership.group_id == group_id,
            GroupMembership.role == MemberRole.OWNER,
        )
    ) or 0


def set_member_role(
    db: DbSession, actor_id: uuid.UUID, org_id: uuid.UUID, group_id: uuid.UUID,
    user_id: uuid.UUID, role: str,
) -> GroupMembership:
    grp = get_group(db, org_id, group_id)
    _require_manage(db, actor_id, org_id, grp)
    if role not in MemberRole.ALL:
        raise BadRequest(f"role must be one of {MemberRole.ALL}.")
    gm = db.scalars(
        select(GroupMembership).where(
            GroupMembership.organization_id == org_id,
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == user_id,
        )
    ).first()
    if gm is None:
        raise NotFound("That user is not in this team.")
    if gm.role == MemberRole.OWNER and role != MemberRole.OWNER and _owner_count(db, org_id, group_id) <= 1:
        raise BadRequest("A team must keep at least one owner.")
    gm.role = role
    _sync_if_team(db, org_id, grp, user_id, role)
    db.flush()
    return gm


def remove_member(
    db: DbSession, actor_id: uuid.UUID, org_id: uuid.UUID, group_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    grp = get_group(db, org_id, group_id)
    _require_manage(db, actor_id, org_id, grp)
    gm = db.scalars(
        select(GroupMembership).where(
            GroupMembership.organization_id == org_id,
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == user_id,
        )
    ).first()
    if gm is None:
        raise NotFound("That user is not in this team.")
    if gm.role == MemberRole.OWNER and _owner_count(db, org_id, group_id) <= 1:
        raise BadRequest("A team must keep at least one owner.")
    db.delete(gm)
    if grp.type == GroupType.TEAM:
        grants.remove_membership_grant(db, org_id=org_id, team_id=grp.id, user_id=user_id)
    db.flush()
    audit.record(
        db, org_id=org_id, actor_id=actor_id, action="group.remove_member",
        target_type="group", target_id=grp.id, data={"user_id": str(user_id)},
    )
    db.flush()


def list_members(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, group_id: uuid.UUID
) -> list[tuple[User, str]]:
    get_group(db, org_id, group_id)  # existence + tenancy
    rows = db.execute(
        select(User, GroupMembership.role)
        .join(GroupMembership, GroupMembership.user_id == User.id)
        .where(
            GroupMembership.organization_id == org_id,
            GroupMembership.group_id == group_id,
        )
        .order_by(User.created_at)
    ).all()
    return [(u, role) for u, role in rows]


def delete_group(
    db: DbSession, actor_id: uuid.UUID, org_id: uuid.UUID, group_id: uuid.UUID
) -> None:
    grp = get_group(db, org_id, group_id)
    _require_manage(db, actor_id, org_id, grp)
    if grp.type == GroupType.TEAM:
        has_projects = db.scalar(
            select(func.count()).where(Project.team_id == group_id)
        )
        if has_projects:
            raise BadRequest(
                "This team still has projects. Move or delete them before deleting the team."
            )
    db.delete(grp)  # cascades memberships + any grants referencing it
    db.flush()
    audit.record(
        db, org_id=org_id, actor_id=actor_id, action="group.delete",
        target_type="group", target_id=group_id, data={"name": grp.name},
    )
    db.flush()
