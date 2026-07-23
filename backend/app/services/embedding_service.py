"""Retrieval: embed content with Gemini and store/search vectors in pgvector.

The `embedding` table lives outside `Base.metadata` (created by migration 0002),
so all access here is raw SQL. Vectors are passed as `'[...]'::vector` text
literals — no extra Python dependency and no per-connection adapter needed.

Indexing is **best-effort**: an embedding failure (quota, network) or a vector
write failure must never break the underlying task/project/comment mutation, so
every DB write runs in a SAVEPOINT and every path swallows+logs its errors.
"""

from __future__ import annotations

import logging
import uuid
from typing import Sequence

from google import genai
from google.genai import types
from sqlalchemy import text
from sqlalchemy.orm import Session as DbSession

from app.config import settings

log = logging.getLogger(__name__)

# Source kinds we embed.
TASK = "task"
PROJECT = "project"
COMMENT = "comment"

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def _vec_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{v:.7f}" for v in values) + "]"


def embed(content: str, *, task_type: str) -> list[float]:
    """Embed a string. task_type is RETRIEVAL_DOCUMENT (indexing) or RETRIEVAL_QUERY (search)."""
    resp = _get_client().models.embed_content(
        model=settings.GEMINI_EMBED_MODEL,
        contents=content,
        config=types.EmbedContentConfig(
            task_type=task_type, output_dimensionality=settings.EMBED_DIM
        ),
    )
    return list(resp.embeddings[0].values)


def index_source(
    db: DbSession,
    org_id: uuid.UUID,
    source_type: str,
    source_id: uuid.UUID,
    content: str | None,
    *,
    force: bool = False,
) -> None:
    """Embed and upsert one source. Best-effort; safe to call from any mutation.
    `force=True` bypasses the inline-index flag (used by the reindex script)."""
    if not settings.ai_enabled:
        return
    if not force and not settings.RETRIEVAL_INLINE_INDEX:
        return
    text_content = (content or "").strip()
    if not text_content:
        delete_source(db, org_id, source_type, source_id)
        return
    try:
        vec = embed(text_content, task_type="RETRIEVAL_DOCUMENT")
    except Exception as e:  # noqa: BLE001
        log.warning("embed failed (%s %s): %s", source_type, source_id, e)
        return
    try:
        with db.begin_nested():
            db.execute(
                text(
                    """
                    INSERT INTO embedding
                        (id, organization_id, source_type, source_id, content, embedding, created_at, updated_at)
                    VALUES
                        (:id, :org, :st, :sid, :content, CAST(:emb AS vector), now(), now())
                    ON CONFLICT (organization_id, source_type, source_id)
                    DO UPDATE SET content = EXCLUDED.content,
                                  embedding = EXCLUDED.embedding,
                                  updated_at = now()
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "org": str(org_id),
                    "st": source_type,
                    "sid": str(source_id),
                    "content": text_content[:8000],
                    "emb": _vec_literal(vec),
                },
            )
    except Exception as e:  # noqa: BLE001
        log.warning("index upsert failed (%s %s): %s", source_type, source_id, e)


def delete_source(
    db: DbSession, org_id: uuid.UUID, source_type: str, source_id: uuid.UUID
) -> None:
    try:
        with db.begin_nested():
            db.execute(
                text(
                    "DELETE FROM embedding WHERE organization_id = :org "
                    "AND source_type = :st AND source_id = :sid"
                ),
                {"org": str(org_id), "st": source_type, "sid": str(source_id)},
            )
    except Exception as e:  # noqa: BLE001
        log.warning("index delete failed (%s %s): %s", source_type, source_id, e)


def search(
    db: DbSession,
    org_id: uuid.UUID,
    query: str,
    *,
    limit: int = 8,
    source_types: list[str] | None = None,
) -> list[dict]:
    """Cosine-nearest sources to `query` within the org (RLS also scopes this)."""
    if not settings.ai_enabled:
        return []
    query = (query or "").strip()
    if not query:
        return []
    qvec = embed(query, task_type="RETRIEVAL_QUERY")
    params: dict = {"org": str(org_id), "qv": _vec_literal(qvec), "lim": max(1, min(int(limit), 25))}
    type_filter = ""
    if source_types:
        params["types"] = list(source_types)
        type_filter = "AND source_type = ANY(:types)"
    rows = db.execute(
        text(
            f"""
            SELECT source_type, source_id, content,
                   1 - (embedding <=> CAST(:qv AS vector)) AS score
            FROM embedding
            WHERE organization_id = :org {type_filter}
            ORDER BY embedding <=> CAST(:qv AS vector)
            LIMIT :lim
            """
        ),
        params,
    ).fetchall()
    return [
        {
            "source_type": r[0],
            "source_id": str(r[1]),
            "content": r[2],
            "score": round(float(r[3]), 4),
        }
        for r in rows
    ]
