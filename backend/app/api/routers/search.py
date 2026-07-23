from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.config import settings
from app.db.session import get_db
from app.errors import ServiceUnavailable
from app.models.identity import User
from app.schemas.core import SearchHit
from app.services import embedding_service

router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[SearchHit])
def search(
    q: str = Query(..., min_length=1, description="Natural-language query"),
    limit: int = Query(default=8, ge=1, le=25),
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[SearchHit]:
    """Semantic search across the org's tasks, projects, and comments."""
    if not settings.ai_enabled:
        raise ServiceUnavailable("Search isn't configured (no embedding model).")
    return [SearchHit(**hit) for hit in embedding_service.search(db, org_id, q, limit=limit)]
