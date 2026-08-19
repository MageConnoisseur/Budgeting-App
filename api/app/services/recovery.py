"""Password reset, email confirmation, and password change helpers."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.models import RecoveryToken, User
from app.security import hash_password, hash_recovery_token, verify_password
from app.services import mailer
from app.services.oauth import find_user_by_login

Purpose = Literal["password_reset", "email_confirm"]

FORGOT_PASSWORD_MESSAGE = (
    "If an account exists for that username or email, we sent reset instructions."
)
CONFIRM_EMAIL_SENT_MESSAGE = (
    "Check your inbox for a confirmation link. It expires in one hour."
)


class RecoveryError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def email_verified(user: User) -> bool:
    return bool(user.email and user.email_verified_at is not None)


def oauth_owns_email(user: User, email: str) -> bool:
    needle = email.strip().lower()
    return any(
        (link.provider_email or "").strip().lower() == needle
        for link in user.oauth_accounts
    )


def mark_email_verified(user: User, when: datetime | None = None) -> None:
    if user.email and user.email_verified_at is None:
        user.email_verified_at = when or datetime.now(UTC)


def apply_email_change(user: User, email: str) -> None:
    """Set recovery email; clear verification unless a linked provider owns it."""
    normalized = email.strip().lower()
    if user.email and user.email.lower() == normalized:
        user.email = normalized
        return
    user.email = normalized
    if oauth_owns_email(user, normalized):
        user.email_verified_at = datetime.now(UTC)
    else:
        user.email_verified_at = None


def _frontend_url(path: str, token: str) -> str:
    settings = get_settings()
    base = settings.frontend_url.rstrip("/")
    return f"{base}{path}?{urlencode({'token': token})}"


def _invalidate_unused(db: Session, user: User, purpose: Purpose) -> None:
    tokens = db.scalars(
        select(RecoveryToken).where(
            RecoveryToken.user_id == user.id,
            RecoveryToken.purpose == purpose,
            RecoveryToken.used_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    for token in tokens:
        token.used_at = now
        db.add(token)


def issue_recovery_token(db: Session, user: User, purpose: Purpose) -> str:
    if not user.email:
        raise RecoveryError(
            "missing_email",
            "Add a recovery email before we can send this link.",
        )
    _invalidate_unused(db, user, purpose)
    raw = secrets.token_urlsafe(32)
    settings = get_settings()
    db.add(
        RecoveryToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_recovery_token(raw),
            email=user.email,
            expires_at=datetime.now(UTC)
            + timedelta(minutes=settings.password_reset_expire_minutes),
        )
    )
    db.commit()
    return raw


def lookup_recovery_token(
    db: Session, raw_token: str, purpose: Purpose
) -> RecoveryToken | None:
    if not raw_token.strip():
        return None
    token = db.scalar(
        select(RecoveryToken)
        .where(
            RecoveryToken.token_hash == hash_recovery_token(raw_token.strip()),
            RecoveryToken.purpose == purpose,
        )
        .options(joinedload(RecoveryToken.user))
    )
    if token is None or token.used_at is not None:
        return None
    now = datetime.now(UTC)
    expires = token.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires <= now:
        return None
    return token


def consume_recovery_token(db: Session, token: RecoveryToken) -> User:
    user = token.user if token.user is not None else db.get(User, token.user_id)
    if user is None:
        raise RecoveryError("invalid_token", "This link is invalid or has expired.")
    if not user.email or user.email.strip().lower() != token.email.strip().lower():
        raise RecoveryError(
            "email_changed",
            "This link was issued for a different email. Request a new one.",
        )
    token.used_at = datetime.now(UTC)
    db.add(token)
    return user


def send_password_reset_email(db: Session, user: User) -> None:
    raw = issue_recovery_token(db, user, "password_reset")
    url = _frontend_url("/reset-password", raw)
    minutes = get_settings().password_reset_expire_minutes
    mailer.send_email(
        to=user.email or "",
        subject="Reset your Hearth Budgeting password",
        body=(
            f"Hi {user.username},\n\n"
            "We received a request to reset the password for your Hearth "
            "Budgeting account.\n\n"
            f"Choose a new password (this link expires in {minutes} minutes):\n"
            f"{url}\n\n"
            "If you did not request this, you can ignore this email. Your "
            "password will stay the same.\n"
        ),
    )


def send_email_confirmation(db: Session, user: User) -> None:
    raw = issue_recovery_token(db, user, "email_confirm")
    url = _frontend_url("/confirm-email", raw)
    minutes = get_settings().password_reset_expire_minutes
    mailer.send_email(
        to=user.email or "",
        subject="Confirm your Hearth Budgeting recovery email",
        body=(
            f"Hi {user.username},\n\n"
            "Confirm that you can receive mail at this address so you can "
            "recover your Hearth Budgeting account if you forget your password.\n\n"
            f"Confirm this email (this link expires in {minutes} minutes):\n"
            f"{url}\n\n"
            "If you did not add this address, you can ignore this email.\n"
        ),
    )


def request_password_reset(db: Session, identifier: str) -> None:
    """Issue a reset email when the account exists and has an email.

    Always silent on missing accounts so usernames/emails cannot be enumerated.
    """
    user = find_user_by_login(db, identifier.strip())
    if user is None or not user.email:
        return
    send_password_reset_email(db, user)


def reset_password(db: Session, raw_token: str, new_password: str) -> User:
    token = lookup_recovery_token(db, raw_token, "password_reset")
    if token is None:
        raise RecoveryError("invalid_token", "This reset link is invalid or has expired.")
    user = consume_recovery_token(db, token)
    user.password_hash = hash_password(new_password)
    mark_email_verified(user)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def confirm_email(db: Session, raw_token: str) -> User:
    token = lookup_recovery_token(db, raw_token, "email_confirm")
    if token is None:
        raise RecoveryError(
            "invalid_token", "This confirmation link is invalid or has expired."
        )
    user = consume_recovery_token(db, token)
    mark_email_verified(user)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def change_or_set_password(
    db: Session,
    user: User,
    new_password: str,
    current_password: str | None,
) -> User:
    if user.password_hash:
        if not current_password or not verify_password(current_password, user.password_hash):
            raise RecoveryError(
                "bad_current",
                "Current password is incorrect.",
            )
    elif not user.email:
        raise RecoveryError(
            "missing_email",
            "Add a recovery email before setting a password so you can reset it later.",
        )
    user.password_hash = hash_password(new_password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
