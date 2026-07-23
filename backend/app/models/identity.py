"""People, tenancy, and access-control entities."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, uuid_pk


class Organization(Base, TimestampMixin):
    """Top tenant + billing boundary. RLS anchors on this id."""

    __tablename__ = "organization"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)


class User(Base, TimestampMixin):
    """Global person identity — the one non-org-scoped principal.

    Identified by any of username / email / mobile; passwordless OTP login.
    """

    __tablename__ = "app_user"  # "user" is a reserved word in Postgres

    id: Mapped[uuid.UUID] = uuid_pk()
    username: Mapped[str | None] = mapped_column(String(100), unique=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    mobile: Mapped[str | None] = mapped_column(String(32), unique=True)
    display_name: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class OrgMembership(Base, TimestampMixin):
    """Records that a User belongs to an Organization (belonging only; the role
    comes from AccessGrant)."""

    __tablename__ = "org_membership"
    __table_args__ = (UniqueConstraint("organization_id", "user_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True
    )


class Group(Base, TimestampMixin):
    """The unified Team/Group entity + permission principal.

    `type=team` doubles as a project container (Projects link to it); `type=group`
    is permission-only. Members live in GroupMembership with an owner|member role.
    """

    __tablename__ = "user_group"  # "group" is a reserved word in Postgres
    __table_args__ = (UniqueConstraint("organization_id", "name"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # GroupType
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"))


class GroupMembership(Base, TimestampMixin):
    __tablename__ = "group_membership"
    __table_args__ = (UniqueConstraint("group_id", "user_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_group.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")  # MemberRole


class AccessGrant(Base, TimestampMixin):
    """The single permission record: principal (user|group) × scope
    (org|team|project) × fixed role. Inherited downward, additive."""

    __tablename__ = "access_grant"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    principal_type: Mapped[str] = mapped_column(String(10), nullable=False)  # PrincipalType
    principal_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="CASCADE"), index=True
    )
    principal_group_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_group.id", ondelete="CASCADE"), index=True
    )
    scope_type: Mapped[str] = mapped_column(String(10), nullable=False)  # ScopeType
    scope_org_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organization.id", ondelete="CASCADE")
    )
    scope_team_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_group.id", ondelete="CASCADE")
    )
    scope_project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # Role
