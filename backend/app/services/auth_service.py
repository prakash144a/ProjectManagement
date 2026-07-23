"""Passwordless-OTP auth: request a code, verify it, issue/revoke sessions.

Auth entities are global (not org-scoped), so these run before any org context
exists and need no RLS GUC.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.core import security
from app.core.rate_limit import rate_limiter
from app.db.base import utcnow
from app.errors import BadRequest, NotFound, RateLimited, Unauthorized
from app.models.auth import OneTimeCode, Session
from app.models.enums import Channel
from app.models.identity import User
from app.services import messaging

log = logging.getLogger("app.auth")

_MOBILE_RE = re.compile(r"^\+?[0-9][0-9\s\-]{5,}$")


def classify_identifier(identifier: str) -> str:
    ident = identifier.strip()
    if "@" in ident:
        return "email"
    if _MOBILE_RE.match(ident):
        return "mobile"
    return "username"


def _find_user(db: DbSession, identifier: str) -> User | None:
    ident = identifier.strip()
    return db.scalars(
        select(User).where(
            (User.email == ident) | (User.mobile == ident) | (User.username == ident)
        )
    ).first()


def _mask(target: str) -> str:
    if "@" in target:
        local, _, domain = target.partition("@")
        return f"{local[:1]}***@{domain[:1]}***"
    return f"{target[:2]}***{target[-2:]}" if len(target) > 4 else "***"


def request_code(
    db: DbSession, identifier: str, client_ip: str, preferred_channel: str | None = None
) -> dict:
    kind = classify_identifier(identifier)
    ident = identifier.strip()

    # Rate-limit per identifier and per IP before doing any work.
    for key in (f"otp:id:{ident.lower()}", f"otp:ip:{client_ip}"):
        if not rate_limiter.allow(key, settings.OTP_RATE_MAX, settings.OTP_RATE_WINDOW_SECONDS):
            raise RateLimited("Too many code requests. Try again later.")

    user = _find_user(db, ident)
    if user is None:
        # Passwordless signup: auto-create for email/mobile identifiers only —
        # a username alone has no delivery channel.
        if kind == "email":
            user = User(email=ident)
        elif kind == "mobile":
            user = User(mobile=ident)
        else:
            raise BadRequest("No account found for that username.")
        db.add(user)
        db.flush()

    # Resolve delivery channel/target. An explicit preference wins (this is the
    # choice the login UI offers when identifying by username); otherwise infer.
    if preferred_channel == Channel.EMAIL:
        if not user.email:
            raise BadRequest("No email on file for this account.")
        channel, target = Channel.EMAIL, user.email
    elif preferred_channel == Channel.SMS:
        if not user.mobile:
            raise BadRequest("No mobile number on file for this account.")
        channel, target = Channel.SMS, user.mobile
    elif kind == "email":
        channel, target = Channel.EMAIL, ident
    elif kind == "mobile":
        channel, target = Channel.SMS, ident
    elif user.email:
        channel, target = Channel.EMAIL, user.email
    elif user.mobile:
        channel, target = Channel.SMS, user.mobile
    else:
        raise BadRequest("Account has no email or mobile to send a code to.")

    code = security.generate_otp(settings.OTP_LENGTH)
    otp = OneTimeCode(
        user_id=user.id,
        target=target,
        channel=channel,
        code_hash=security.hash_otp(code),
        expires_at=utcnow() + timedelta(minutes=settings.OTP_TTL_MINUTES),
    )
    db.add(otp)
    db.flush()

    # Deliver via the provider seam. If a configured provider fails, this raises
    # and the request transaction rolls back (get_db), so no orphaned code is
    # left behind. With no provider (dev), it logs the code and returns False.
    messaging.deliver_otp(channel, target, code)

    return {
        "sent": True,
        "channel": channel,
        "target_hint": _mask(target),
        "dev_code": code if settings.DEV_OTP_ECHO else None,
    }


def verify_code(db: DbSession, identifier: str, code: str) -> tuple[Session, str, User]:
    user = _find_user(db, identifier)
    if user is None:
        raise Unauthorized("Invalid code.")

    otp = db.scalars(
        select(OneTimeCode)
        .where(OneTimeCode.user_id == user.id, OneTimeCode.consumed.is_(False))
        .order_by(OneTimeCode.created_at.desc())
    ).first()

    if otp is None or otp.expires_at <= utcnow():
        raise Unauthorized("Invalid or expired code.")
    if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise Unauthorized("Too many attempts. Request a new code.")

    otp.attempts += 1
    if not security.verify_otp(otp.code_hash, code.strip()):
        db.flush()
        raise Unauthorized("Invalid or expired code.")

    otp.consumed = True

    raw_token = security.generate_session_token()
    session = Session(
        user_id=user.id,
        token_hash=security.hash_token(raw_token),
        expires_at=utcnow() + timedelta(days=settings.SESSION_TTL_DAYS),
    )
    db.add(session)
    db.flush()
    return session, raw_token, user


def resolve_session(db: DbSession, raw_token: str) -> tuple[Session, User] | None:
    token_hash = security.hash_token(raw_token)
    session = db.scalars(
        select(Session).where(Session.token_hash == token_hash)
    ).first()
    if session is None or session.revoked_at is not None:
        return None
    if session.expires_at <= utcnow():
        return None
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        return None
    session.last_used_at = utcnow()
    return session, user


def revoke_session(db: DbSession, session: Session) -> None:
    session.revoked_at = utcnow()
    db.flush()


# --- Personal Access Tokens (long-lived, org-scoped; used by the MCP server) ---


def create_pat(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, name: str
) -> tuple[Session, str]:
    raw_token = security.generate_session_token()
    pat = Session(
        user_id=user_id,
        token_hash=security.hash_token(raw_token),
        expires_at=utcnow() + timedelta(days=settings.PAT_TTL_DAYS),
        kind="pat",
        name=(name or "token").strip()[:100],
        organization_id=org_id,
    )
    db.add(pat)
    db.flush()
    return pat, raw_token


def list_pats(db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID) -> list[Session]:
    return list(
        db.scalars(
            select(Session)
            .where(
                Session.user_id == user_id,
                Session.kind == "pat",
                Session.organization_id == org_id,
                Session.revoked_at.is_(None),
            )
            .order_by(Session.created_at.desc())
        )
    )


def revoke_pat(
    db: DbSession, user_id: uuid.UUID, org_id: uuid.UUID, token_id: uuid.UUID
) -> None:
    pat = db.get(Session, token_id)
    if (
        pat is None
        or pat.kind != "pat"
        or pat.user_id != user_id
        or pat.organization_id != org_id
    ):
        raise NotFound("Token not found.")
    pat.revoked_at = utcnow()
    db.flush()
