"""Secret generation + hashing for OTP codes and session tokens.

- **OTP codes** are low-entropy (6 digits), so they are hashed with **argon2**
  (slow, salted) and verified with a constant-time check.
- **Session tokens** are high-entropy (256-bit random), so a fast deterministic
  **SHA-256** is sufficient and lets us look the session up by an indexed hash.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()


def generate_otp(length: int = 6) -> str:
    """A numeric one-time code, zero-padded to `length` digits."""
    upper = 10**length
    return str(secrets.randbelow(upper)).zfill(length)


def hash_otp(code: str) -> str:
    return _ph.hash(code)


def verify_otp(code_hash: str, code: str) -> bool:
    try:
        return _ph.verify(code_hash, code)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def generate_session_token() -> str:
    """Opaque, URL-safe 256-bit token. Returned to the client once; only its
    hash is stored."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
