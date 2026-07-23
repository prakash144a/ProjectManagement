from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session as DbSession

from app.api.deps import client_ip, current_session, current_user
from app.db.session import get_db
from app.models.auth import Session
from app.models.identity import User
from app.schemas.auth import (
    RequestCodeIn,
    RequestCodeOut,
    SessionOut,
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
