"""personal access tokens (MCP): extend auth_session

Revision ID: 0003_pat
Revises: 0002_retrieval
Create Date: 2026-07-22

A Personal Access Token is a long-lived, org-scoped session. Adds kind/name/
organization_id to auth_session. Additive; existing sessions default to 'session'.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0003_pat"
down_revision: Union[str, None] = "0002_retrieval"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE auth_session ADD COLUMN kind varchar(20) NOT NULL DEFAULT 'session'")
    op.execute("ALTER TABLE auth_session ADD COLUMN name varchar(100)")
    op.execute(
        "ALTER TABLE auth_session ADD COLUMN organization_id uuid "
        "REFERENCES organization(id) ON DELETE CASCADE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE auth_session DROP COLUMN IF EXISTS organization_id")
    op.execute("ALTER TABLE auth_session DROP COLUMN IF EXISTS name")
    op.execute("ALTER TABLE auth_session DROP COLUMN IF EXISTS kind")
