from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, org_context
from app.db.session import get_db
from app.models.collab import ProjectComment, TaskComment
from app.models.identity import User
from app.schemas.core import CommentCreate, CommentOut
from app.services import comment_service

router = APIRouter(tags=["comments"])


def _out(c: TaskComment | ProjectComment, author_name: str | None) -> CommentOut:
    return CommentOut(
        id=c.id,
        body=c.body,
        author_id=c.author_id,
        author_name=author_name,
        created_at=c.created_at,
    )


# --- Task comments ---

@router.get("/tasks/{task_id}/comments", response_model=list[CommentOut])
def list_task_comments(
    task_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[CommentOut]:
    return [
        _out(c, name)
        for c, name in comment_service.list_task_comments(db, user.id, org_id, task_id)
    ]


@router.post("/tasks/{task_id}/comments", response_model=CommentOut, status_code=201)
def add_task_comment(
    task_id: uuid.UUID,
    body: CommentCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> CommentOut:
    c, name = comment_service.add_task_comment(db, user.id, org_id, task_id, body.body)
    return _out(c, name)


@router.delete("/tasks/{task_id}/comments/{comment_id}", status_code=204)
def delete_task_comment(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    comment_service.delete_task_comment(db, user.id, org_id, comment_id)


# --- Project comments (Discussions) ---

@router.get("/projects/{project_id}/comments", response_model=list[CommentOut])
def list_project_comments(
    project_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[CommentOut]:
    return [
        _out(c, name)
        for c, name in comment_service.list_project_comments(db, user.id, org_id, project_id)
    ]


@router.post("/projects/{project_id}/comments", response_model=CommentOut, status_code=201)
def add_project_comment(
    project_id: uuid.UUID,
    body: CommentCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> CommentOut:
    c, name = comment_service.add_project_comment(db, user.id, org_id, project_id, body.body)
    return _out(c, name)


@router.delete("/projects/{project_id}/comments/{comment_id}", status_code=204)
def delete_project_comment(
    project_id: uuid.UUID,
    comment_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    comment_service.delete_project_comment(db, user.id, org_id, comment_id)
