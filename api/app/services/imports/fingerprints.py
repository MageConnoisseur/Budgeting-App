"""Stable identities for imported rows, plus merchant keys for future category rules."""

from __future__ import annotations

import hashlib
import re
from datetime import date
from decimal import Decimal

_STORE_NUM = re.compile(r"\s+#\d+\b")
_TRAILING_NUM = re.compile(r"\s+\d{4,}$")
_NON_ALNUM = re.compile(r"[^A-Z0-9]+")


def normalize_description(description: str) -> str:
    return " ".join(description.upper().split())


def merchant_key(description: str) -> str:
    """Collapse issuer payee text into a stable key for future merchant rules.

    Strips store numbers (``COSTCO WHSE #123`` → ``COSTCO WHSE``) so later
    imports of the same chain can share a rule. Not used for auto-categorization
    yet — first-time merchants stay in the inbox.
    """
    text = normalize_description(description)
    text = _STORE_NUM.sub("", text)
    text = _TRAILING_NUM.sub("", text)
    text = " ".join(text.split())
    return text[:128]


def row_fingerprint(
    *,
    source: str,
    account_key: str,
    trans_date: date,
    amount: Decimal,
    description: str,
) -> str:
    """Hash of source + account + date + amount + payee.

    Discover CSVs have no unique transaction id, so this is the re-upload key.
    Same file imported twice (or the same row in a later statement) is a no-op.
    """
    payload = "|".join(
        [
            source.strip().lower(),
            account_key.strip().lower(),
            trans_date.isoformat(),
            f"{amount.quantize(Decimal('0.01')):.2f}",
            normalize_description(description),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def merchant_tokens(key: str) -> set[str]:
    parts = _NON_ALNUM.split(key.upper())
    return {p for p in parts if len(p) >= 3}
