from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.agent import runtime
from app.agent.tools import ToolContext
from app.api.deps import current_user, org_context
from app.config import settings
from app.db.session import get_db
from app.errors import ServiceUnavailable
from app.models.identity import User
from app.schemas.core import ChatAction, ChatIn, ChatOut

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatOut)
def chat(
    body: ChatIn,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> ChatOut:
    if not settings.ai_enabled:
        raise ServiceUnavailable(
            "The chat assistant isn't configured. Add GEMINI_API_KEY to enable it."
        )
    ctx = ToolContext(db=db, user=user, org_id=org_id)
    history = [m.model_dump() for m in body.history]
    reply, actions = runtime.run(ctx, history, body.message)
    return ChatOut(reply=reply, actions=[ChatAction(**a) for a in actions])
