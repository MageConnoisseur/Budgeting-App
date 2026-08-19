"""Auth routes: register, login, OAuth, profile, password recovery."""

from __future__ import annotations

from typing import Annotated, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    OAuthProviderInfo,
    PasswordChangeRequest,
    RecoveryTokenStatus,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
    UserPreferencesUpdate,
    UserProfileUpdate,
)
from app.security import create_access_token, hash_password, verify_password
from app.services import oauth as oauth_svc
from app.services import recovery as recovery_svc
from app.services.mailer import MailError

router = APIRouter(prefix="/auth", tags=["auth"])
optional_bearer = HTTPBearer(auto_error=False)


def _load_user(db: Session, user_id: UUID) -> User | None:
    return db.scalar(
        select(User)
        .where(User.id == user_id)
        .options(joinedload(User.oauth_accounts))
    )


def _user_out(user: User) -> UserOut:
    return UserOut.model_validate(oauth_svc.serialize_user(user))


def _recovery_http(exc: recovery_svc.RecoveryError) -> HTTPException:
    return HTTPException(status_code=400, detail=exc.message)


def _issue_token(user: User) -> TokenResponse:
    token = create_access_token(str(user.id), extra={"username": user.username})
    return TokenResponse(access_token=token)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.scalar(select(User).where(User.username == body.username))
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    email = str(body.email).strip().lower()
    email_taken = db.scalar(select(User).where(func.lower(User.email) == email))
    if email_taken:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        username=body.username,
        email=email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_token(user)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = oauth_svc.find_user_by_login(db, body.username)
    if (
        user is None
        or not user.password_hash
        or not verify_password(body.password, user.password_hash)
    ):
        raise HTTPException(status_code=401, detail="Invalid username/email or password")
    return _issue_token(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserOut:
    loaded = _load_user(db, user.id)
    assert loaded is not None
    return _user_out(loaded)


@router.patch("/me/preferences", response_model=UserOut)
def update_preferences(
    body: UserPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    if body.preferred_budget_view is not None:
        user.preferred_budget_view = body.preferred_budget_view.value
    if body.preferred_dashboard_view is not None:
        user.preferred_dashboard_view = body.preferred_dashboard_view.value
    db.add(user)
    db.commit()
    loaded = _load_user(db, user.id)
    assert loaded is not None
    return _user_out(loaded)


@router.patch("/me/profile", response_model=UserOut)
def update_profile(
    body: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    loaded = _load_user(db, user.id)
    assert loaded is not None
    email = str(body.email).strip().lower()
    conflict = db.scalar(
        select(User).where(func.lower(User.email) == email, User.id != loaded.id)
    )
    if conflict:
        raise HTTPException(status_code=400, detail="Email already registered")
    recovery_svc.apply_email_change(loaded, email)
    db.add(loaded)
    db.commit()
    loaded = _load_user(db, loaded.id)
    assert loaded is not None
    return _user_out(loaded)


@router.patch("/me/password", response_model=UserOut)
def change_password(
    body: PasswordChangeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    loaded = _load_user(db, user.id)
    assert loaded is not None
    try:
        recovery_svc.change_or_set_password(
            db,
            loaded,
            body.new_password,
            body.current_password,
        )
    except recovery_svc.RecoveryError as exc:
        raise _recovery_http(exc) from exc
    loaded = _load_user(db, loaded.id)
    assert loaded is not None
    return _user_out(loaded)


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    body: ForgotPasswordRequest, db: Session = Depends(get_db)
) -> MessageResponse:
    try:
        recovery_svc.request_password_reset(db, body.identifier)
    except MailError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not send email. Try again later.",
        ) from exc
    return MessageResponse(message=recovery_svc.FORGOT_PASSWORD_MESSAGE)


@router.get("/reset-password", response_model=RecoveryTokenStatus)
def reset_password_status(
    token: str = Query(min_length=8, max_length=256),
    db: Session = Depends(get_db),
) -> RecoveryTokenStatus:
    found = recovery_svc.lookup_recovery_token(db, token, "password_reset")
    return RecoveryTokenStatus(valid=found is not None)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    body: ResetPasswordRequest, db: Session = Depends(get_db)
) -> MessageResponse:
    try:
        recovery_svc.reset_password(db, body.token, body.password)
    except recovery_svc.RecoveryError as exc:
        raise _recovery_http(exc) from exc
    return MessageResponse(
        message="Password updated. You can sign in with your new password."
    )


@router.get("/oauth/providers", response_model=list[OAuthProviderInfo])
def oauth_providers() -> list[OAuthProviderInfo]:
    return [OAuthProviderInfo.model_validate(p) for p in oauth_svc.list_providers()]


@router.get("/oauth/{provider}/start")
def oauth_start(
    provider: str,
    intent: Literal["login", "link"] = Query(default="login"),
    access_token: str | None = Query(
        default=None,
        description="JWT for link intent when the browser cannot send Authorization",
    ),
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(optional_bearer)
    ] = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    provider = provider.lower().strip()
    if not oauth_svc.provider_configured(provider):
        raise HTTPException(
            status_code=400,
            detail=f"{provider} sign-in is not configured on this server",
        )

    link_user_id: UUID | None = None
    if intent == "link":
        raw_token = (
            credentials.credentials
            if credentials is not None
            else (access_token or "").strip() or None
        )
        if not raw_token:
            raise HTTPException(
                status_code=401,
                detail="Sign in first to link a social account",
            )
        from app.security import TokenError, get_subject_from_token

        try:
            subject = get_subject_from_token(raw_token)
            link_user_id = UUID(subject)
        except (TokenError, ValueError) as exc:
            raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
        if db.get(User, link_user_id) is None:
            raise HTTPException(status_code=401, detail="User not found")

    try:
        state = oauth_svc.create_oauth_state(intent, link_user_id)
        url = oauth_svc.build_authorize_url(provider, state)
    except oauth_svc.OAuthError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc

    return RedirectResponse(url=url, status_code=302)


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    provider = provider.lower().strip()

    if error:
        detail = error_description or error
        return RedirectResponse(
            oauth_svc.frontend_redirect(
                "/login",
                params={"oauth_error": "denied", "detail": detail[:200]},
            ),
            status_code=302,
        )

    if not code or not state:
        return RedirectResponse(
            oauth_svc.frontend_redirect(
                "/login",
                params={"oauth_error": "invalid_request", "detail": "Missing OAuth code"},
            ),
            status_code=302,
        )

    try:
        oauth_state = oauth_svc.parse_oauth_state(state)
    except oauth_svc.OAuthError as exc:
        return RedirectResponse(
            oauth_svc.frontend_redirect(
                "/login",
                params={"oauth_error": exc.code, "detail": exc.message},
            ),
            status_code=302,
        )

    try:
        profile = oauth_svc.exchange_code_for_profile(provider, code)
        if oauth_state.intent == "link":
            if oauth_state.user_id is None:
                raise oauth_svc.OAuthError("invalid_state", "Link session missing user")
            user = _load_user(db, oauth_state.user_id)
            if user is None:
                raise oauth_svc.OAuthError("invalid_state", "User not found for link")
            user = oauth_svc.link_oauth_account(db, user, profile)
            token = create_access_token(str(user.id), extra={"username": user.username})
            return RedirectResponse(
                oauth_svc.frontend_redirect(
                    "/auth/callback",
                    params={"token": token, "linked": provider},
                ),
                status_code=302,
            )

        user = oauth_svc.resolve_oauth_login(db, profile)
        token = create_access_token(str(user.id), extra={"username": user.username})
        return RedirectResponse(
            oauth_svc.frontend_redirect(
                "/auth/callback",
                params={"token": token},
            ),
            status_code=302,
        )
    except oauth_svc.OAuthError as exc:
        target = "/account" if oauth_state.intent == "link" else "/login"
        return RedirectResponse(
            oauth_svc.frontend_redirect(
                target,
                params={"oauth_error": exc.code, "detail": exc.message},
            ),
            status_code=302,
        )


@router.delete("/oauth/{provider}", response_model=UserOut)
def unlink_oauth(
    provider: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    loaded = _load_user(db, user.id)
    assert loaded is not None
    try:
        updated = oauth_svc.unlink_oauth_account(db, loaded, provider.lower().strip())
    except oauth_svc.OAuthError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    return _user_out(updated)


@router.get("/oauth/dev/simulate", response_class=HTMLResponse)
def oauth_dev_simulate(state: str = Query(...)) -> HTMLResponse:
    """Local-only form that mints a fake provider identity for testing OAuth."""
    from urllib.parse import quote

    from app.config import get_settings

    if not get_settings().oauth_dev_mode:
        raise HTTPException(status_code=404, detail="Not found")

    safe_state = quote(state, safe="")
    # Render state into a hidden field via HTML escaping of quotes.
    escaped = (
        state.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Dev OAuth</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 28rem; margin: 3rem auto; padding: 0 1rem; }}
    label {{ display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }}
    input {{ width: 100%; padding: 0.5rem; box-sizing: border-box; }}
    button {{ margin-top: 1rem; padding: 0.6rem 1rem; font-weight: 600; }}
  </style>
</head>
<body>
  <h1>Dev OAuth</h1>
  <p>Simulate a social login for local testing. State ref: {safe_state[:12]}…</p>
  <form method="post" action="/api/auth/oauth/dev/simulate">
    <input type="hidden" name="state" value="{escaped}" />
    <label for="email">Email</label>
    <input id="email" name="email" type="email" required value="dev.user@example.com" />
    <label for="subject">Provider subject</label>
    <input id="subject" name="subject" required value="dev-subject-1" />
    <label for="display_name">Display name</label>
    <input id="display_name" name="display_name" value="Dev User" />
    <button type="submit">Continue</button>
  </form>
</body>
</html>"""
    return HTMLResponse(html)


@router.post("/oauth/dev/simulate")
def oauth_dev_simulate_submit(
    state: Annotated[str, Form()],
    email: Annotated[str, Form()],
    subject: Annotated[str, Form()],
    display_name: Annotated[str, Form()] = "Dev User",
) -> RedirectResponse:
    from urllib.parse import urlencode

    from app.config import get_settings

    if not get_settings().oauth_dev_mode:
        raise HTTPException(status_code=404, detail="Not found")

    profile = oauth_svc.ProviderProfile(
        provider="dev",
        subject=subject.strip(),
        email=email.strip().lower() or None,
        display_name=display_name.strip() or None,
    )
    code = oauth_svc.encode_dev_code(profile)
    url = (
        f"{get_settings().api_public_url.rstrip('/')}"
        f"/api/auth/oauth/dev/callback?{urlencode({'code': code, 'state': state})}"
    )
    return RedirectResponse(url=url, status_code=302)
