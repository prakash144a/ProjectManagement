"""Backfill embeddings for an org's existing tasks, projects, and comments.

Inline indexing keeps new content embedded; run this once per org to index
content created before retrieval existed (or after toggling the model).

Usage (server not required; needs live DB + GEMINI_API_KEY):
    python scripts/reindex.py <org_id>
"""

from __future__ import annotations

import sys
import uuid

from app.db.engine import SessionLocal
from app.db.session import set_current_org
from app.models.collab import ProjectComment, TaskComment
from app.models.work import Project, Task
from app.services import embedding_service as es


def reindex(org_id: uuid.UUID) -> int:
    db = SessionLocal()
    n = 0
    try:
        set_current_org(db, org_id)  # RLS: scope reads + embedding writes to this org
        for t in db.query(Task).all():
            es.index_source(
                db, org_id, es.TASK, t.id, f"{t.title}\n{t.description or ''}".strip(), force=True
            )
            n += 1
        for p in db.query(Project).all():
            es.index_source(
                db, org_id, es.PROJECT, p.id, f"{p.name}\n{p.description or ''}".strip(), force=True
            )
            n += 1
        for c in db.query(TaskComment).all():
            es.index_source(db, org_id, es.COMMENT, c.id, c.body, force=True)
            n += 1
        for c in db.query(ProjectComment).all():
            es.index_source(db, org_id, es.COMMENT, c.id, c.body, force=True)
            n += 1
        db.commit()
    finally:
        db.close()
    return n


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python scripts/reindex.py <org_id>")
        raise SystemExit(1)
    count = reindex(uuid.UUID(sys.argv[1]))
    print(f"Reindexed {count} sources for org {sys.argv[1]}.")
