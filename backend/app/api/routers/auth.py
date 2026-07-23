from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session as DbSession

from app.api.deps import client_ip, current_session, current_user, org_context
from app.db.session import get_db
from app.models.auth import Session
from app.models.identity import User
from app.schemas.auth import (
    RequestCodeIn,
    RequestCodeOut,
    SessionOut,
    TokenCreate,
    TokenCreated,
    TokenOut,
    UserOut,
    VerifyCodeIn,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-code", response_model=RequestCodeOut)
def request_code(
    body: RequestCodeIn,
    request: Request,
    db: DbSession = Depends(get_db),
) -> RequestCodeOut:
    result = auth_service.request_code(
        db, body.identifier, client_ip(request), body.channel
    )
    return RequestCodeOut(**result)


@router.post("/verify", response_model=SessionOut)
def verify(body: VerifyCodeIn, db: DbSession = Depends(get_db)) -> SessionOut:
    session, token, user = auth_service.verify_code(db, body.identifier, body.code)
    return SessionOut(token=token, expires_at=session.expires_at, user_id=user.id)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user


@router.post("/logout")
def logout(
    session: Session = Depends(current_session),
    db: DbSession = Depends(get_db),
) -> dict:
    auth_service.revoke_session(db, session)
    return {"ok": True}


# --- Personal Access Tokens (org-scoped; used to connect the MCP server) ---

@router.post("/tokens", response_model=TokenCreated, status_code=201)
def create_token(
    body: TokenCreate,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> TokenCreated:
    pat, raw = auth_service.create_pat(db, user.id, org_id, body.name)
    return TokenCreated(
        id=pat.id, name=pat.name, token=raw, created_at=pat.created_at, expires_at=pat.expires_at
    )


@router.get("/tokens", response_model=list[TokenOut])
def list_tokens(
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[TokenOut]:
    return [TokenOut.model_validate(p) for p in auth_service.list_pats(db, user.id, org_id)]


@router.delete("/tokens/{token_id}", status_code=204)
def revoke_token(
    token_id: uuid.UUID,
    org_id: uuid.UUID = Depends(org_context),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    auth_service.revoke_pat(db, user.id, org_id, token_id)
