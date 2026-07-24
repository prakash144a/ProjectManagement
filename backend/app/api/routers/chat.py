from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.agent import runtime
from app.agent.tools import ToolContext
from app.api.deps import current_user, org_context
from app.config import settings
from app.db.base import utcnow
from app.db.session import get_db
from app.errors import ServiceUnavailable
from app.models.identity import User
from app.schemas.core import (
    ChatAction,
    ChatConversationOut,
    ChatIn,
    ChatMessageOut,
    ChatOut,
    ConversationRename,
)
from app.services import chat_service

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

    # Resolve (or create) the conversation, then load its history from the DB —
    # the client no longer needs to carry the transcript.
    if body.conversation_id is not None:
        conv = chat_service.get_conversation(db, org_id, user.id, body.conversation_id)
    else:
        conv = chat_service.create_conversation(
            db, org_id, user.id, title=chat_service.derive_title(body.message)
        )
    history = chat_service.history_for(
        chat_service.list_messages(db, org_id, user.id, conv.id)
    )

    chat_service.append_message(db, org_id, conv.id, "user", body.message)

    ctx = ToolContext(db=db, user=user, org_id=org_id)
    reply, actions = runtime.run(ctx, history, body.message)

    chat_service.append_message(db, org_id, conv.id, "assistant", reply, actions=actions)
    conv.updated_at = utcnow()  # surface recent activity in the conversation list
    db.flush()

    return ChatOut(
        reply=reply,
        actions=[ChatAction(**a) for a in actions],
        conversation_id=conv.id,
        title=conv.title,
    )


# --- Conversation history ---

@router.get("/chat/conversations", response_model=list[ChatConversationOut])
def list_conversations(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[ChatConversationOut]:
    return [
        ChatConversationOut.model_validate(c)
        for c in chat_service.list_conversations(db, org_id, user.id)
    ]


@router.post("/chat/conversations", response_model=ChatConversationOut, status_code=201)
def create_conversation(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> ChatConversationOut:
    conv = chat_service.create_conversation(db, org_id, user.id)
    return ChatConversationOut.model_validate(conv)


@router.get(
    "/chat/conversations/{conversation_id}/messages",
    response_model=list[ChatMessageOut],
)
def list_messages(
    conversation_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[ChatMessageOut]:
    return [
        ChatMessageOut.model_validate(m)
        for m in chat_service.list_messages(db, org_id, user.id, conversation_id)
    ]


@router.patch("/chat/conversations/{conversation_id}", response_model=ChatConversationOut)
def rename_conversation(
    conversation_id: uuid.UUID,
    body: ConversationRename,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> ChatConversationOut:
    conv = chat_service.rename_conversation(db, org_id, user.id, conversation_id, body.title)
    return ChatConversationOut.model_validate(conv)


@router.delete("/chat/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    chat_service.delete_conversation(db, org_id, user.id, conversation_id)
