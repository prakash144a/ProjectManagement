from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RequestCodeIn(BaseModel):
    identifier: str = Field(min_length=1, description="username, email, or mobile")
    channel: str | None = Field(
        default=None, description="Preferred OTP channel: 'email' or 'sms'"
    )


class RequestCodeOut(BaseModel):
    sent: bool
    channel: str
    target_hint: str  # masked delivery target, e.g. "j***@e***.com"
    # Only populated in dev (DEV_OTP_ECHO) so testing needs no SMS/email provider.
    dev_code: str | None = None


class VerifyCodeIn(BaseModel):
    identifier: str = Field(min_length=1)
    code: str = Field(min_length=1)


class SessionOut(BaseModel):
    token: str
    expires_at: datetime
    user_id: uuid.UUID


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str | None
    email: str | None
    mobile: str | None
    display_name: str | None
