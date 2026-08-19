"""Password reset, change/set password, and Resend delivery."""

from __future__ import annotations

import re
import uuid
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import mailer
from app.services.recovery import FORGOT_PASSWORD_MESSAGE

client = TestClient(app)
TOKEN_RE = re.compile(r"token=([A-Za-z0-9_\-]+)")


@pytest.fixture(autouse=True)
def _clear_mail_outbox():
    from app.config import get_settings

    get_settings.cache_clear()
    mailer.clear_outbox()
    yield
    get_settings.cache_clear()
    mailer.clear_outbox()


def _register(password: str = "testpass123") -> tuple[dict[str, str], str, str, str]:
    username = f"pw_{uuid.uuid4().hex[:10]}"
    email = f"{username}@example.com"
    r = client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return headers, username, email, password


def _token_from_latest_email() -> str:
    assert mailer.outbox, "expected an outbound recovery email"
    body = str(mailer.outbox[-1]["body"])
    match = TOKEN_RE.search(body)
    assert match, body
    return match.group(1)


def _dev_oauth_callback(email: str | None, subject: str) -> str:
    start = client.get(
        "/api/auth/oauth/dev/start",
        params={"intent": "login"},
        follow_redirects=False,
    )
    assert start.status_code in (302, 307), start.text
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    from app.services.oauth import ProviderProfile, encode_dev_code

    code = encode_dev_code(
        ProviderProfile(
            provider="dev",
            subject=subject,
            email=email,
            display_name="Dev User",
        )
    )
    callback = client.get(
        "/api/auth/oauth/dev/callback",
        params={"code": code, "state": state},
        follow_redirects=False,
    )
    assert callback.status_code in (302, 307), callback.text
    return callback.headers["location"]


def test_password_signup_email_is_unverified() -> None:
    headers, _, email, _ = _register()
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == email
    assert body["email_verified"] is False
    assert body["has_password"] is True


def test_forgot_password_is_generic_for_unknown_accounts() -> None:
    r = client.post(
        "/api/auth/forgot-password",
        json={"identifier": "nobody-at-all@example.com"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["message"] == FORGOT_PASSWORD_MESSAGE
    assert mailer.outbox == []


def test_forgot_and_reset_password_then_login() -> None:
    headers, username, email, old_password = _register()
    forgot = client.post(
        "/api/auth/forgot-password",
        json={"identifier": email},
    )
    assert forgot.status_code == 200, forgot.text
    assert forgot.json()["message"] == FORGOT_PASSWORD_MESSAGE
    token = _token_from_latest_email()

    status = client.get("/api/auth/reset-password", params={"token": token})
    assert status.status_code == 200
    assert status.json()["valid"] is True

    new_password = "newpass456"
    reset = client.post(
        "/api/auth/reset-password",
        json={"token": token, "password": new_password},
    )
    assert reset.status_code == 200, reset.text

    reused = client.post(
        "/api/auth/reset-password",
        json={"token": token, "password": "anotherpass1"},
    )
    assert reused.status_code == 400

    old_login = client.post(
        "/api/auth/login",
        json={"username": username, "password": old_password},
    )
    assert old_login.status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"username": username, "password": new_password},
    )
    assert login.status_code == 200, login.text
    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )
    assert me.json()["email_verified"] is True
    # Original session token still works; reset does not revoke JWTs.
    still = client.get("/api/auth/me", headers=headers)
    assert still.status_code == 200


def test_forgot_password_accepts_username() -> None:
    _, username, _, _ = _register()
    r = client.post(
        "/api/auth/forgot-password",
        json={"identifier": username},
    )
    assert r.status_code == 200, r.text
    assert mailer.outbox
    assert username in str(mailer.outbox[-1]["body"])


def test_invalid_reset_token() -> None:
    status = client.get(
        "/api/auth/reset-password",
        params={"token": "totally-invalid-token-value"},
    )
    assert status.status_code == 200
    assert status.json()["valid"] is False
    reset = client.post(
        "/api/auth/reset-password",
        json={"token": "totally-invalid-token-value", "password": "password123"},
    )
    assert reset.status_code == 400


def test_change_password_requires_current() -> None:
    headers, username, _, password = _register()
    wrong = client.patch(
        "/api/auth/me/password",
        headers=headers,
        json={"current_password": "wrongpass1", "new_password": "newerpass1"},
    )
    assert wrong.status_code == 400
    # 400 must not clear the session (web client logs out on 401).
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200

    missing = client.patch(
        "/api/auth/me/password",
        headers=headers,
        json={"new_password": "newerpass1"},
    )
    assert missing.status_code == 400

    ok = client.patch(
        "/api/auth/me/password",
        headers=headers,
        json={"current_password": password, "new_password": "newerpass1"},
    )
    assert ok.status_code == 200, ok.text
    login = client.post(
        "/api/auth/login",
        json={"username": username, "password": "newerpass1"},
    )
    assert login.status_code == 200, login.text


def test_changing_email_clears_verified_flag() -> None:
    headers, username, email, _ = _register()
    client.post("/api/auth/forgot-password", json={"identifier": email})
    token = _token_from_latest_email()
    client.post(
        "/api/auth/reset-password",
        json={"token": token, "password": "resetpass1"},
    )
    login = client.post(
        "/api/auth/login",
        json={"username": username, "password": "resetpass1"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=headers).json()["email_verified"] is True

    new_email = f"moved_{uuid.uuid4().hex[:8]}@example.com"
    upd = client.patch(
        "/api/auth/me/profile",
        headers=headers,
        json={"email": new_email},
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["email"] == new_email
    assert upd.json()["email_verified"] is False


def test_oauth_email_is_verified_and_can_set_password() -> None:
    email = f"oauth_pw_{uuid.uuid4().hex[:10]}@example.com"
    location = _dev_oauth_callback(email, f"subj_{uuid.uuid4().hex[:8]}")
    token = parse_qs(urlparse(location).query)["token"][0]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["email"] == email
    assert me["email_verified"] is True
    assert me["has_password"] is False

    needs_current = client.patch(
        "/api/auth/me/password",
        headers=headers,
        json={"new_password": "socialpass1"},
    )
    assert needs_current.status_code == 200, needs_current.text
    assert needs_current.json()["has_password"] is True

    login = client.post(
        "/api/auth/login",
        json={"username": email, "password": "socialpass1"},
    )
    assert login.status_code == 200, login.text


def test_oauth_without_email_cannot_set_password() -> None:
    location = _dev_oauth_callback(None, f"noemail_{uuid.uuid4().hex[:8]}")
    token = parse_qs(urlparse(location).query)["token"][0]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["email"] is None
    assert me["email_verified"] is False

    refused = client.patch(
        "/api/auth/me/password",
        headers=headers,
        json={"new_password": "socialpass1"},
    )
    assert refused.status_code == 400
    assert "recovery email" in refused.json()["detail"].lower()

    forgot = client.post(
        "/api/auth/forgot-password",
        json={"identifier": me["username"]},
    )
    assert forgot.status_code == 200
    assert mailer.outbox == []


def test_health_reports_log_only_email_without_resend() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["email"] == "log_only"


def test_resend_posts_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("RESEND_FROM", "Hearth Budgeting <noreply@example.com>")
    get_settings.cache_clear()
    calls: list[dict] = []

    class _Resp:
        status_code = 200
        text = '{"id":"email_1"}'

    def fake_post(url: str, **kwargs: object):
        calls.append({"url": url, **kwargs})
        return _Resp()

    monkeypatch.setattr(mailer.httpx, "post", fake_post)
    mailer.send_email(
        to="pat@example.com",
        subject="Reset your Hearth Budgeting password",
        body="plain",
        html="<p>html</p>",
    )
    assert len(calls) == 1
    assert calls[0]["url"] == "https://api.resend.com/emails"
    headers = calls[0]["headers"]
    assert headers["Authorization"] == "Bearer re_test_key"
    payload = calls[0]["json"]
    assert payload["from"] == "Hearth Budgeting <noreply@example.com>"
    assert payload["to"] == ["pat@example.com"]
    assert payload["text"] == "plain"
    assert payload["html"] == "<p>html</p>"
