"""retrieval: pgvector extension + embedding table (A1)

Revision ID: 0002_retrieval
Revises: 0001_initial
Create Date: 2026-07-22

Additive migration (no schema reset). Adds the `embedding` table used for
semantic "ask anything" retrieval. It's deliberately kept out of Base.metadata
and created here with raw SQL, so the vector column + HNSW index are managed
explicitly and don't affect the 0001 metadata baseline.

Requires the `vector` extension to be allow-listed on Azure Postgres
(`azure.extensions` server parameter must include VECTOR) before running.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from app.config import settings

revision: str = "0002_retrieval"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ORG = "current_setting('app.current_org_id', true)::uuid"


def upgrade() -> None:
    dim = settings.EMBED_DIM

    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(
        f"""
        CREATE TABLE embedding (
            id uuid PRIMARY KEY,
            organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
            source_type varchar(20) NOT NULL,
            source_id uuid NOT NULL,
            content text NOT NULL,
            embedding vector({dim}) NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_embedding_source UNIQUE (organization_id, source_type, source_id)
        )
        """
    )
    op.execute("CREATE INDEX ix_embedding_org ON embedding (organization_id)")
    op.execute(
        "CREATE INDEX ix_embedding_vec ON embedding "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    # Same tenant-isolation RLS as every other org-scoped table (app connects as
    # the table owner, hence FORCE). Fails closed when the org GUC is unset.
    op.execute("ALTER TABLE embedding ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE embedding FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY org_isolation ON embedding
            USING (organization_id = {_ORG})
            WITH CHECK (organization_id = {_ORG})
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS embedding")
    # Leave the extension installed; other objects may rely on it.
