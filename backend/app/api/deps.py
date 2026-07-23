"""FastAPI dependencies: DB session, authenticated user, tenant context.

`get_db` is FastAPI-cached per request, so `current_user` and the route handler
share one session — and the RLS GUCs set here apply to every query in the request.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db, set_current_org, set_current_user
from app.errors import BadRequest, Forbidden, Unauthorized
from app.models.auth import Session
from app.models.identity import User
from app.services import auth_service, authz


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized("Missing bearer token.")
    return authorization.split(" ", 1)[1].strip()


def get_auth(
    db: DbSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> tuple[Session, User]:
    token = _bearer_token(authorization)
    result = auth_service.resolve_session(db, token)
    if result is None:
        raise Unauthorized("Invalid or expired session.")
    session, user = result
    # Establish the identity for RLS (org context is set later, per resource).
    set_current_user(db, user.id)
    return session, user


def current_user(auth: tuple[Session, User] = Depends(get_auth)) -> User:
    return auth[1]


def current_session(auth: tuple[Session, User] = Depends(get_auth)) -> Session:
    return auth[0]


def org_context(
    x_org_id: uuid.UUID | None = Header(default=None, alias="X-Org-Id"),
    auth: tuple[Session, User] = Depends(get_auth),
    db: DbSession = Depends(get_db),
) -> uuid.UUID:
    """Select the active organization for a request: set the RLS org context and
    verify the caller is a member. Per-object role checks happen in the services.

    A Personal Access Token is org-scoped, so it selects its own org and the
    X-Org-Id header is optional; a normal session must supply the header."""
    session, user = auth
    if session.kind == "pat" and session.organization_id is not None:
        org_id = session.organization_id
    elif x_org_id is not None:
        org_id = x_org_id
    else:
        raise BadRequest("X-Org-Id header is required.")
    set_current_org(db, org_id)
    if not authz.is_org_member(db, user.id, org_id):
        raise Forbidden("You are not a member of this organization.")
    return org_id
