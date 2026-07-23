"""task progress bar

Revision ID: 0004_task_progress
Revises: 0003_pat
Create Date: 2026-07-23

Adds a self-reported completion column to task (0..100). Additive; existing rows
default to 0. A task in a completed status is forced to 100 by the service layer.
Project-level status/progress are derived at runtime (no stored column).
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0004_task_progress"
down_revision: Union[str, None] = "0003_pat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE task ADD COLUMN progress integer NOT NULL DEFAULT 0")
    # Backfill: any already-completed task should read as 100%.
    op.execute(
        "UPDATE task SET progress = 100 WHERE completed_at IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE task DROP COLUMN IF EXISTS progress")
