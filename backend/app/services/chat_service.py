"""Chat conversation history (per-user, org-scoped).

Conversations are private to their owner. RLS scopes rows to the current org; this
layer filters/checks `user_id` on top so one member can't reach another's chats
(mirrors `notification_service`). Chat content is deliberately NOT fed to the
shared semantic index — see the router/plan note.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.errors import NotFound
from app.models.chat import ChatConversation, ChatMessage

_TITLE_MAX = 60


def derive_title(text: str) -> str:
    """A short title from the first user message: first line, trimmed to ~60 chars."""
    line = (text or "").strip().splitlines()[0].strip() if text.strip() else "New chat"
    return line[:_TITLE_MAX].rstrip() or "New chat"


def list_conversations(
    db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> list[ChatConversation]:
    return list(
        db.scalars(
            select(ChatConversation)
            .where(
                ChatConversation.organization_id == org_id,
                ChatConversation.user_id == user_id,
            )
            .order_by(ChatConversation.updated_at.desc())
            .limit(100)
        )
    )


def create_conversation(
    db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID, title: str | None = None
) -> ChatConversation:
    conv = ChatConversation(organization_id=org_id, user_id=user_id, title=title)
    db.add(conv)
    db.flush()
    return conv


def get_conversation(
    db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID, conv_id: uuid.UUID
) -> ChatConversation:
    conv = db.get(ChatConversation, conv_id)
    if conv is None or conv.organization_id != org_id or conv.user_id != user_id:
        raise NotFound("Conversation not found.")
    return conv


def list_messages(
    db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID, conv_id: uuid.UUID
) -> list[ChatMessage]:
    get_conversation(db, org_id, user_id, conv_id)  # ownership check
    return list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conv_id)
            .order_by(ChatMessage.created_at, ChatMessage.id)
        )
    )


def rename_conversation(
    db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID, conv_id: uuid.UUID, title: str
) -> ChatConversation:
    conv = get_conversation(db, org_id, user_id, conv_id)
    conv.title = title.strip()[:200] or None
    db.flush()
    return conv


def delete_conversation(
    db: DbSession, org_id: uuid.UUID, user_id: uuid.UUID, conv_id: uuid.UUID
) -> None:
    conv = get_conversation(db, org_id, user_id, conv_id)
    db.delete(conv)  # cascades to messages
    db.flush()


def append_message(
    db: DbSession,
    org_id: uuid.UUID,
    conv_id: uuid.UUID,
    role: str,
    content: str,
    actions: list | None = None,
) -> ChatMessage:
    msg = ChatMessage(
        organization_id=org_id,
        conversation_id=conv_id,
        role=role,
        content=content,
        actions=actions or None,
    )
    db.add(msg)
    db.flush()
    return msg


def history_for(messages: list[ChatMessage]) -> list[dict]:
    """Prior turns as the agent expects them: [{role, content}]."""
    return [{"role": m.role, "content": m.content} for m in messages]
