"""Audit + activity writes — recorded in the same transaction as the mutation."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session as DbSession

from app.models.collab import ActivityEvent
from app.models.platform import AuditLog


def record(
    db: DbSession,
    *,
    org_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    data: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            organization_id=org_id,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            data=data,
        )
    )


def activity(
    db: DbSession,
    *,
    org_id: uuid.UUID,
    task_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    verb: str,
    data: dict | None = None,
) -> None:
    db.add(
        ActivityEvent(
            organization_id=org_id,
            task_id=task_id,
            actor_id=actor_id,
            verb=verb,
            data=data,
        )
    )
