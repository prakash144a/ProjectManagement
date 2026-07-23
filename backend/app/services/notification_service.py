"""In-app notifications, created inline in REST (no event bus).

Delivered as an inbox the client fetches. Realtime push is a north-star item;
for now users see new notifications on refresh.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session as DbSession

from app.errors import NotFound
from app.models.platform import Notification


def notify(
    db: DbSession,
    *,
    org_id: uuid.UUID,
    recipient_id: uuid.UUID,
    type_: str,
    ref_type: str | None = None,
    ref_id: uuid.UUID | None = None,
) -> Notification:
    n = Notification(
        organization_id=org_id,
        recipient_id=recipient_id,
        type=type_,
        ref_type=ref_type,
        ref_id=ref_id,
    )
    db.add(n)
    db.flush()
    return n


def list_for_user(
    db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID, *, unread_only: bool = False
) -> list[Notification]:
    stmt = select(Notification).where(
        Notification.organization_id == org_id, Notification.recipient_id == user_id
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    return list(db.scalars(stmt.order_by(Notification.created_at.desc()).limit(100)))


def unread_count(db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count()).where(
            Notification.organization_id == org_id,
            Notification.recipient_id == user_id,
            Notification.is_read.is_(False),
        )
    ) or 0


def mark_read(
    db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID, notif_id: uuid.UUID
) -> Notification:
    n = db.get(Notification, notif_id)
    if n is None or n.organization_id != org_id or n.recipient_id != user_id:
        raise NotFound("Notification not found.")
    n.is_read = True
    db.flush()
    return n


def mark_all_read(db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID) -> int:
    result = db.execute(
        update(Notification)
        .where(
            Notification.organization_id == org_id,
            Notification.recipient_id == user_id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    db.flush()
    return result.rowcount or 0
