"""Request-scoped DB session + RLS tenant-context helpers.

One transaction per request: `get_db` yields a session, commits on success,
rolls back on error. Services never commit on their own, so the RLS GUCs set
via `set_config(..., is_local => true)` (i.e. SET LOCAL) stay in effect for the
whole request.

RLS policies read `app.current_org_id` (and `app.current_user_id`). We set them
with Postgres `set_config()` rather than `SET` so the value can be safely bound
as a parameter (SET does not accept bind params).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.engine import SessionLocal


def _set_local(db: Session, key: str, value: str) -> None:
    # is_local => true makes this equivalent to SET LOCAL (transaction-scoped).
    db.execute(text("SELECT set_config(:k, :v, true)"), {"k": key, "v": value})


def set_current_user(db: Session, user_id: uuid.UUID | str) -> None:
    _set_local(db, "app.current_user_id", str(user_id))


def set_current_org(db: Session, org_id: uuid.UUID | str) -> None:
    _set_local(db, "app.current_org_id", str(org_id))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
