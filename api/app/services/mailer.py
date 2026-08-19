"""Outbound email for account recovery.

When SMTP is not configured, messages are logged and stored in `outbox` so
local/dev and tests can still exercise forgot-password and confirm-email flows.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

outbox: list[dict[str, Any]] = []


class MailError(Exception):
    """SMTP send failed."""


def clear_outbox() -> None:
    outbox.clear()


def send_email(*, to: str, subject: str, body: str) -> None:
    """Send a plaintext email, or log it when SMTP is unset."""
    settings = get_settings()
    record = {"to": to, "subject": subject, "body": body}
    outbox.append(record)

    if not settings.smtp_host.strip():
        logger.info(
            "Email not sent (SMTP_HOST unset). to=%s subject=%s\n%s",
            to,
            subject,
            body,
        )
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        logger.exception("Failed to send email to %s", to)
        raise MailError("Could not send email") from exc
