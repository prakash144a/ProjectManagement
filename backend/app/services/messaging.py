"""Outbound message delivery (OTP codes today; extensible to other notices).

A thin provider seam so business logic never talks to a vendor SDK directly.
Email goes through **Azure Communication Services** when configured; otherwise
delivery falls back to logging the code so local/dev needs no provider. SMS is
deferred — `deliver_otp` raises for it behind the same interface.

`deliver_otp` returns True when a real provider sent the message, False when it
dev-logged. It raises `ServiceUnavailable` if a configured provider fails, so
the caller can surface a clear error and roll back the pending code.
"""

from __future__ import annotations

import logging

from app.config import settings
from app.errors import BadRequest, ServiceUnavailable
from app.models.enums import Channel

log = logging.getLogger("app.messaging")


def _otp_email(code: str) -> tuple[str, str, str]:
    """Return (subject, plain_text, html) for an OTP email."""
    app = settings.APP_NAME
    minutes = settings.OTP_TTL_MINUTES
    subject = f"{app} sign-in code: {code}"
    plain = (
        f"Your {app} verification code is {code}.\n\n"
        f"It expires in {minutes} minutes. "
        f"If you didn't request this, you can ignore this email."
    )
    html = (
        f"<div style=\"font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1a1a2e\">"
        f"<p>Your <strong>{app}</strong> verification code is:</p>"
        f"<p style=\"font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0\">{code}</p>"
        f"<p style=\"color:#555\">It expires in {minutes} minutes. "
        f"If you didn't request this, you can safely ignore this email.</p>"
        f"</div>"
    )
    return subject, plain, html


def _send_email_acs(target: str, code: str) -> None:
    """Send the OTP via Azure Communication Services Email. Raises on failure."""
    try:
        from azure.communication.email import EmailClient
    except ImportError as exc:  # configured but SDK missing → misconfiguration
        raise ServiceUnavailable(
            "Email is configured but the azure-communication-email package is not installed."
        ) from exc

    subject, plain, html = _otp_email(code)
    message = {
        "senderAddress": settings.ACS_EMAIL_SENDER,
        "recipients": {"to": [{"address": target}]},
        "content": {"subject": subject, "plainText": plain, "html": html},
    }
    try:
        client = EmailClient.from_connection_string(settings.ACS_EMAIL_CONNECTION_STRING)
        poller = client.begin_send(message)
        result = poller.result()  # blocks until the send is accepted/failed
    except Exception as exc:  # network / auth / unverified-sender / quota
        log.exception("ACS email send failed for %s", target)
        raise ServiceUnavailable(
            "Couldn't send the verification code. Please try again."
        ) from exc

    status = (result or {}).get("status")
    if status and str(status).lower() not in {"succeeded", "running"}:
        log.error("ACS email send returned status=%s for %s", status, target)
        raise ServiceUnavailable(
            "Couldn't send the verification code. Please try again."
        )


def deliver_otp(channel: str, target: str, code: str) -> bool:
    """Deliver an OTP `code` to `target` over `channel`.

    Returns True if a real provider sent it, False if it was only dev-logged.
    Raises `ServiceUnavailable` when a configured provider fails to send, and
    `BadRequest` for a channel with no delivery path yet (SMS).
    """
    if channel == Channel.EMAIL:
        if settings.email_enabled:
            _send_email_acs(target, code)
            log.info("OTP delivered via email to %s", target)
            return True
        # Dev fallback: no provider configured.
        log.info("OTP for %s via email (dev-log, no provider): %s", target, code)
        return False

    if channel == Channel.SMS:
        # No SMS provider yet (later milestone). In dev, keep the code flowing via
        # the log so mobile testing works; in prod, fail loudly rather than
        # silently accept a code that will never be delivered.
        if settings.is_dev:
            log.info("OTP for %s via sms (dev-log, no provider): %s", target, code)
            return False
        raise BadRequest("SMS delivery is not available yet. Use email instead.")

    raise BadRequest(f"Unsupported delivery channel: {channel}")
