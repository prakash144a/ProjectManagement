"""chat conversation history

Revision ID: 0005_chat_history
Revises: 0004_task_progress
Create Date: 2026-07-23

DB-backed multi-conversation history for the chat agent. Two org-scoped tables:
- chat_conversation: a per-user (owned by user_id) named thread inside an org.
- chat_message: the turns of a conversation (role/content + optional tool trace).

Both get the standard org-isolation RLS policy (organization_id = current org).
Per-user ownership is enforced in the service layer on top of RLS.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0005_chat_history"
down_revision: Union[str, None] = "0004_task_progress"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ORG = "current_setting('app.current_org_id', true)::uuid"


def _enable_force_isolation(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY org_isolation ON {table}
            USING (organization_id = {_ORG})
            WITH CHECK (organization_id = {_ORG})
        """
    )


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE chat_conversation (
            id uuid PRIMARY KEY,
            organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
            user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            title varchar(200),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_chat_conversation_organization_id ON chat_conversation (organization_id)")
    op.execute("CREATE INDEX ix_chat_conversation_user_id ON chat_conversation (user_id)")

    op.execute(
        """
        CREATE TABLE chat_message (
            id uuid PRIMARY KEY,
            organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
            conversation_id uuid NOT NULL REFERENCES chat_conversation(id) ON DELETE CASCADE,
            role varchar(16) NOT NULL,
            content text NOT NULL,
            actions jsonb,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_chat_message_organization_id ON chat_message (organization_id)")
    op.execute("CREATE INDEX ix_chat_message_conversation_id ON chat_message (conversation_id)")

    _enable_force_isolation("chat_conversation")
    _enable_force_isolation("chat_message")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chat_message")
    op.execute("DROP TABLE IF EXISTS chat_conversation")
