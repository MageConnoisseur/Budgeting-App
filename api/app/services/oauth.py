"""OAuth provider helpers (Google, Facebook, optional local dev)."""

from __future__ import annotations

import json
import re
import secrets
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from urllib.parse import urlencode
from uuid import UUID

import httpx
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import OAuthAccount, User

Intent = Literal["login", "link"]

PROVIDER_LABELS = {
    "google": "Google",
    "facebook": "Facebook",
    "dev": "Dev (local)",
}


@dataclass(frozen=True)
class ProviderProfile:
    provider: str
    subject: str
    email: str | None
    display_name: str | None = None


@dataclass(frozen=True)
class OAuthState:
    intent: Intent
    user_id: UUID | None
    nonce: str


class OAuthError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def list_providers(settings: Settings | None = None) -> list[dict[str, Any]]:
    settings = settings or get_settings()
    providers: list[dict[str, Any]] = [
        {
            "id": "google",
            "name": PROVIDER_LABELS["google"],
            "configured": bool(settings.google_client_id and settings.google_client_secret),
        },
        {
            "id": "facebook",
            "name": PROVIDER_LABELS["facebook"],
            "configured": bool(settings.facebook_app_id and settings.facebook_app_secret),
        },
    ]
    if settings.oauth_dev_mode:
        providers.append(
            {
                "id": "dev",
                "name": PROVIDER_LABELS["dev"],
                "configured": True,
            }
        )
    return providers


def provider_configured(provider: str, settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    for item in list_providers(settings):
        if item["id"] == provider:
            return bool(item["configured"])
    return False


def callback_url(provider: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    return f"{settings.api_public_url.rstrip('/')}/api/auth/oauth/{provider}/callback"


def create_oauth_state(
    intent: Intent,
    user_id: UUID | None = None,
    *,
    settings: Settings | None = None,
) -> str:
    settings = settings or get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=10)
    payload: dict[str, Any] = {
        "purpose": "oauth_state",
        "intent": intent,
        "user_id": str(user_id) if user_id else None,
        "nonce": secrets.token_urlsafe(16),
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def parse_oauth_state(token: str, *, settings: Settings | None = None) -> OAuthState:
    settings = settings or get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise OAuthError("invalid_state", "OAuth session expired or invalid") from exc
    if payload.get("purpose") != "oauth_state":
        raise OAuthError("invalid_state", "OAuth session expired or invalid")
    intent = payload.get("intent")
    if intent not in ("login", "link"):
        raise OAuthError("invalid_state", "OAuth session expired or invalid")
    user_id_raw = payload.get("user_id")
    user_id = UUID(user_id_raw) if user_id_raw else None
    nonce = str(payload.get("nonce") or "")
    return OAuthState(intent=intent, user_id=user_id, nonce=nonce)


def build_authorize_url(provider: str, state: str, *, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    if not provider_configured(provider, settings):
        raise OAuthError("provider_unavailable", f"{provider} sign-in is not configured")

    redirect_uri = callback_url(provider, settings)

    if provider == "google":
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    if provider == "facebook":
        params = {
            "client_id": settings.facebook_app_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": "email,public_profile",
            "response_type": "code",
        }
        return f"https://www.facebook.com/v19.0/dialog/oauth?{urlencode(params)}"

    if provider == "dev" and settings.oauth_dev_mode:
        params = {"state": state}
        return (
            f"{settings.api_public_url.rstrip('/')}/api/auth/oauth/dev/simulate"
            f"?{urlencode(params)}"
        )

    raise OAuthError("provider_unavailable", f"Unknown OAuth provider: {provider}")


def encode_dev_code(profile: ProviderProfile) -> str:
    raw = json.dumps(
        {
            "subject": profile.subject,
            "email": profile.email,
            "display_name": profile.display_name,
        }
    ).encode()
    return urlsafe_b64encode(raw).decode().rstrip("=")


def decode_dev_code(code: str) -> ProviderProfile:
    pad = "=" * (-len(code) % 4)
    try:
        data = json.loads(urlsafe_b64decode(code + pad).decode())
    except (ValueError, json.JSONDecodeError) as exc:
        raise OAuthError("oauth_failed", "Invalid dev OAuth code") from exc
    subject = str(data.get("subject") or "").strip()
    if not subject:
        raise OAuthError("oauth_failed", "Dev OAuth subject is required")
    email = data.get("email")
    email_norm = str(email).strip().lower() if email else None
    display = data.get("display_name")
    return ProviderProfile(
        provider="dev",
        subject=subject,
        email=email_norm,
        display_name=str(display) if display else None,
    )


def exchange_code_for_profile(
    provider: str,
    code: str,
    *,
    settings: Settings | None = None,
) -> ProviderProfile:
    settings = settings or get_settings()
    if provider == "dev":
        if not settings.oauth_dev_mode:
            raise OAuthError("provider_unavailable", "Dev OAuth is disabled")
        return decode_dev_code(code)

    redirect_uri = callback_url(provider, settings)

    if provider == "google":
        with httpx.Client(timeout=20.0) as client:
            token_resp = client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            if token_resp.status_code >= 400:
                raise OAuthError("oauth_failed", "Google token exchange failed")
            access_token = token_resp.json().get("access_token")
            if not access_token:
                raise OAuthError("oauth_failed", "Google did not return an access token")
            user_resp = client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if user_resp.status_code >= 400:
                raise OAuthError("oauth_failed", "Google userinfo request failed")
            data = user_resp.json()
        subject = str(data.get("sub") or "").strip()
        if not subject:
            raise OAuthError("oauth_failed", "Google account id missing")
        email = data.get("email")
        return ProviderProfile(
            provider="google",
            subject=subject,
            email=str(email).strip().lower() if email else None,
            display_name=data.get("name"),
        )

    if provider == "facebook":
        with httpx.Client(timeout=20.0) as client:
            token_resp = client.get(
                "https://graph.facebook.com/v19.0/oauth/access_token",
                params={
                    "client_id": settings.facebook_app_id,
                    "client_secret": settings.facebook_app_secret,
                    "redirect_uri": redirect_uri,
                    "code": code,
                },
            )
            if token_resp.status_code >= 400:
                raise OAuthError("oauth_failed", "Facebook token exchange failed")
            access_token = token_resp.json().get("access_token")
            if not access_token:
                raise OAuthError("oauth_failed", "Facebook did not return an access token")
            user_resp = client.get(
                "https://graph.facebook.com/me",
                params={
                    "fields": "id,name,email",
                    "access_token": access_token,
                },
            )
            if user_resp.status_code >= 400:
                raise OAuthError("oauth_failed", "Facebook profile request failed")
            data = user_resp.json()
        subject = str(data.get("id") or "").strip()
        if not subject:
            raise OAuthError("oauth_failed", "Facebook account id missing")
        email = data.get("email")
        return ProviderProfile(
            provider="facebook",
            subject=subject,
            email=str(email).strip().lower() if email else None,
            display_name=data.get("name"),
        )

    raise OAuthError("provider_unavailable", f"Unknown OAuth provider: {provider}")


def _sanitize_username_base(raw: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", raw.strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("._-")
    if len(cleaned) < 3:
        cleaned = f"user_{cleaned}" if cleaned else "user"
    return cleaned[:40]


def allocate_username(db: Session, preferred: str) -> str:
    base = _sanitize_username_base(preferred)
    candidate = base
    n = 0
    while db.scalar(select(User).where(User.username == candidate)) is not None:
        n += 1
        suffix = f"_{n}"
        candidate = f"{base[: 64 - len(suffix)]}{suffix}"
    return candidate


def find_user_by_login(db: Session, login: str) -> User | None:
    value = login.strip()
    if not value:
        return None
    user = db.scalar(select(User).where(User.username == value))
    if user:
        return user
    return db.scalar(select(User).where(func.lower(User.email) == value.lower()))


def find_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.lower()))


def user_auth_methods(user: User) -> tuple[bool, list[str]]:
    has_password = bool(user.password_hash)
    providers = sorted({link.provider for link in user.oauth_accounts})
    return has_password, providers


def serialize_user(user: User) -> dict[str, Any]:
    has_password, providers = user_auth_methods(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "email_verified": bool(user.email and user.email_verified_at is not None),
        "has_password": has_password,
        "oauth_providers": providers,
        "preferred_budget_view": user.preferred_budget_view,
        "preferred_dashboard_view": user.preferred_dashboard_view,
        "created_at": user.created_at,
    }


def link_oauth_account(
    db: Session,
    user: User,
    profile: ProviderProfile,
    *,
    fill_empty_email: bool = True,
) -> User:
    existing = db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == profile.provider,
            OAuthAccount.provider_subject == profile.subject,
        )
    )
    if existing and existing.user_id != user.id:
        raise OAuthError(
            "provider_linked_elsewhere",
            "That social account is already linked to a different Setaside user",
        )
    if existing is None:
        same_provider = db.scalar(
            select(OAuthAccount).where(
                OAuthAccount.user_id == user.id,
                OAuthAccount.provider == profile.provider,
            )
        )
        if same_provider is not None:
            raise OAuthError(
                "provider_already_linked",
                f"This account already has {PROVIDER_LABELS.get(profile.provider, profile.provider)} linked",
            )
        db.add(
            OAuthAccount(
                user_id=user.id,
                provider=profile.provider,
                provider_subject=profile.subject,
                provider_email=profile.email,
            )
        )
    else:
        existing.provider_email = profile.email or existing.provider_email

    if fill_empty_email and not user.email and profile.email:
        conflict = find_user_by_email(db, profile.email)
        if conflict is None or conflict.id == user.id:
            user.email = profile.email
            user.email_verified_at = datetime.now(UTC)
    elif (
        user.email
        and profile.email
        and user.email.strip().lower() == profile.email.strip().lower()
        and user.email_verified_at is None
    ):
        user.email_verified_at = datetime.now(UTC)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def resolve_oauth_login(db: Session, profile: ProviderProfile) -> User:
    """Login or create a user from an OAuth profile without merging on email alone."""
    linked = db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == profile.provider,
            OAuthAccount.provider_subject == profile.subject,
        )
    )
    if linked:
        user = db.get(User, linked.user_id)
        if user is None:
            raise OAuthError("oauth_failed", "Linked user is missing")
        if profile.email and linked.provider_email != profile.email:
            linked.provider_email = profile.email
            db.add(linked)
        if (
            user.email
            and profile.email
            and user.email.strip().lower() == profile.email.strip().lower()
            and user.email_verified_at is None
        ):
            user.email_verified_at = datetime.now(UTC)
            db.add(user)
        db.commit()
        return user

    if profile.email:
        existing = find_user_by_email(db, profile.email)
        if existing is not None:
            # Do not auto-merge — that would risk attaching to the wrong person
            # or surprising the user. They must sign in and link explicitly.
            raise OAuthError(
                "account_exists",
                "An account with this email already exists. Sign in with your "
                "password, then link this social account from Account settings "
                "so your budget data stays on one account.",
            )

    preferred = (profile.email or "").split("@")[0] if profile.email else (
        profile.display_name or f"{profile.provider}_user"
    )
    username = allocate_username(db, preferred)
    user = User(
        username=username,
        email=profile.email,
        password_hash=None,
        email_verified_at=datetime.now(UTC) if profile.email else None,
    )
    db.add(user)
    db.flush()
    db.add(
        OAuthAccount(
            user_id=user.id,
            provider=profile.provider,
            provider_subject=profile.subject,
            provider_email=profile.email,
        )
    )
    db.commit()
    db.refresh(user)
    return user


def unlink_oauth_account(db: Session, user: User, provider: str) -> User:
    link = db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.user_id == user.id,
            OAuthAccount.provider == provider,
        )
    )
    if link is None:
        raise OAuthError("not_linked", "That provider is not linked to this account")

    has_password, providers = user_auth_methods(user)
    remaining = [p for p in providers if p != provider]
    if not has_password and not remaining:
        raise OAuthError(
            "last_auth_method",
            "Cannot unlink the only sign-in method. Add a password or another provider first.",
        )

    db.delete(link)
    db.commit()
    db.refresh(user)
    return user


def frontend_redirect(
    path: str,
    *,
    params: dict[str, str] | None = None,
    settings: Settings | None = None,
) -> str:
    settings = settings or get_settings()
    base = settings.frontend_url.rstrip("/")
    path = path if path.startswith("/") else f"/{path}"
    if params:
        return f"{base}{path}?{urlencode(params)}"
    return f"{base}{path}"
