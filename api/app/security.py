"""Password hashing and JWT helpers.

Auth strategy:
- Username/email + password registration/login
- Optional Google / Facebook (and local `dev`) OAuth with explicit account linking
- Password reset / recovery via emailed one-time tokens
- Passwords hashed with bcrypt via passlib
- Stateless JWT Bearer tokens (Authorization: Bearer <token>)
- Token payload includes `sub` = user id (string)
"""

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_recovery_token(raw: str) -> str:
    """SHA-256 hex digest for one-time reset/confirm tokens (high entropy)."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


class TokenError(Exception):
    pass


def get_subject_from_token(token: str) -> str:
    try:
        payload = decode_access_token(token)
        sub = payload.get("sub")
        if not sub:
            raise TokenError("missing subject")
        return str(sub)
    except JWTError as exc:
        raise TokenError("invalid token") from exc
