from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.db.session import get_db
from app.models.identity import User
from app.schemas.core import NotificationOut
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[NotificationOut]:
    return [
        NotificationOut.model_validate(n)
        for n in notification_service.list_for_user(db, org_id, user.id)
    ]


@router.post("/{notif_id}/read", response_model=NotificationOut)
def mark_read(
    notif_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> NotificationOut:
    return NotificationOut.model_validate(
        notification_service.mark_read(db, org_id, user.id, notif_id)
    )


@router.post("/read-all")
def mark_all_read(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict:
    count = notification_service.mark_all_read(db, org_id, user.id)
    return {"marked": count}
