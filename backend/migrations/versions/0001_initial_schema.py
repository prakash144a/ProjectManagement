"""initial schema + row-level security

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-21

Tables are created from the model metadata (this is the greenfield baseline;
subsequent migrations use normal Alembic autogenerate diffs). Row-level security
is then applied explicitly — Alembic does not autogenerate RLS.

RLS model:
- Every org-scoped child table: `organization_id = current_setting('app.current_org_id')`.
- `organization`: visible if it's the selected org OR the caller is a member.
  WITH CHECK (true) so a brand-new org can be inserted before any membership exists.
- `org_membership`: matched by current org OR the caller's own user id (so a user can
  list their orgs before selecting one).
- FORCE ROW LEVEL SECURITY on every table because the app connects as the table
  owner, which would otherwise bypass policies.
- `current_setting(..., true)` returns NULL when unset → policies fail closed.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from app.db.base import Base
import app.models  # noqa: F401  (populate metadata)
from app.models import ORG_SCOPED_TABLES

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ORG = "current_setting('app.current_org_id', true)::uuid"
_USER = "current_setting('app.current_user_id', true)::uuid"


def _enable_force(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind)

    # Standard tenant-isolation policy on every org-scoped child table.
    for table in ORG_SCOPED_TABLES:
        _enable_force(table)
        op.execute(
            f"""
            CREATE POLICY org_isolation ON {table}
                USING (organization_id = {_ORG})
                WITH CHECK (organization_id = {_ORG})
            """
        )

    # organization: member-or-selected visibility; open insert for org creation.
    _enable_force("organization")
    op.execute(
        f"""
        CREATE POLICY org_self ON organization
            USING (
                id = {_ORG}
                OR EXISTS (
                    SELECT 1 FROM org_membership m
                    WHERE m.organization_id = organization.id
                      AND m.user_id = {_USER}
                )
            )
            WITH CHECK (true)
        """
    )

    # org_membership: current org OR the caller's own memberships.
    _enable_force("org_membership")
    op.execute(
        f"""
        CREATE POLICY membership_access ON org_membership
            USING (organization_id = {_ORG} OR user_id = {_USER})
            WITH CHECK (organization_id = {_ORG} OR user_id = {_USER})
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
