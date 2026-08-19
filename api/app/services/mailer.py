"""Outbound email for password reset via Resend.

When RESEND_API_KEY is unset, messages are logged and stored in `outbox` so
local/dev and tests can still exercise forgot-password without a live provider.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

RESEND_EMAILS_URL = "https://api.resend.com/emails"

outbox: list[dict[str, Any]] = []


class MailError(Exception):
    """Resend send failed."""


def clear_outbox() -> None:
    outbox.clear()


def mail_configured() -> bool:
    settings = get_settings()
    return bool(settings.resend_api_key.strip() and settings.resend_from.strip())


def send_email(*, to: str, subject: str, body: str, html: str | None = None) -> None:
    """Send a plaintext (and optional HTML) email through Resend, or log it."""
    settings = get_settings()
    record = {"to": to, "subject": subject, "body": body, "html": html}
    outbox.append(record)

    if not mail_configured():
        logger.info(
            "Email not sent (RESEND_API_KEY / RESEND_FROM unset). to=%s subject=%s\n%s",
            to,
            subject,
            body,
        )
        return

    payload: dict[str, Any] = {
        "from": settings.resend_from,
        "to": [to],
        "subject": subject,
        "text": body,
    }
    if html:
        payload["html"] = html

    try:
        response = httpx.post(
            RESEND_EMAILS_URL,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
    except httpx.HTTPError as exc:
        logger.exception("Failed to reach Resend for %s", to)
        raise MailError("Could not send email") from exc

    if response.status_code >= 400:
        logger.error(
            "Resend rejected email to %s: %s %s",
            to,
            response.status_code,
            response.text[:500],
        )
        raise MailError("Could not send email")
