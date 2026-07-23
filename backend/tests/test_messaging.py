"""Unit tests for the OTP delivery seam (no DB, no live provider)."""

from __future__ import annotations

import pytest

from app.config import settings
from app.errors import BadRequest, ServiceUnavailable
from app.models.enums import Channel
from app.services import messaging


def test_otp_email_contains_code_and_app_name():
    subject, plain, html = messaging._otp_email("123456")
    assert "123456" in subject
    assert "123456" in plain
    assert "123456" in html
    assert settings.APP_NAME in subject


def test_deliver_email_dev_fallback_returns_false(caplog):
    # No ACS creds configured in tests → dev-log fallback, no provider used.
    assert settings.email_enabled is False
    with caplog.at_level("INFO", logger="app.messaging"):
        used_provider = messaging.deliver_otp(Channel.EMAIL, "u@example.com", "654321")
    assert used_provider is False
    assert "654321" in caplog.text


def test_deliver_sms_dev_logs_in_dev():
    # is_dev is true under the test env → SMS dev-logs rather than raising.
    assert settings.is_dev is True
    assert messaging.deliver_otp(Channel.SMS, "+15551234567", "111222") is False


def test_deliver_unknown_channel_raises():
    with pytest.raises(BadRequest):
        messaging.deliver_otp("carrier-pigeon", "somewhere", "000000")


def test_configured_email_missing_sdk_raises(monkeypatch):
    # Simulate "provider configured" then force the SDK import to fail: should be
    # surfaced as ServiceUnavailable, not leak an ImportError.
    monkeypatch.setattr(settings, "ACS_EMAIL_CONNECTION_STRING", "endpoint=https://x;accesskey=y")
    monkeypatch.setattr(settings, "ACS_EMAIL_SENDER", "DoNotReply@example.com")
    assert settings.email_enabled is True

    import builtins

    real_import = builtins.__import__

    def _fail_import(name, *args, **kwargs):
        if name.startswith("azure.communication.email"):
            raise ImportError("simulated missing SDK")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _fail_import)
    with pytest.raises(ServiceUnavailable):
        messaging.deliver_otp(Channel.EMAIL, "u@example.com", "999888")
