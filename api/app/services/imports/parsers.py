"""Bank CSV parsers. Discover is first; register another parser when adding a bank."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.enums import ImportSource
from app.services.imports.fingerprints import merchant_key, row_fingerprint

_PAYMENT_RE = re.compile(
    r"(INTERNET\s+PAYMENT|AUTOMATIC\s+PAYMENT|MOBILE\s+PAYMENT|"
    r"ONLINE\s+PAYMENT|PAYMENT\s*[-–]?\s*THANK\s+YOU)",
    re.IGNORECASE,
)
_HEADER_ALIASES = {
    "trans date": "trans_date",
    "transaction date": "trans_date",
    "post date": "post_date",
    "posted date": "post_date",
    "description": "description",
    "amount": "amount",
    "category": "issuer_category",
}
_DATE_FORMATS = ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d")


@dataclass(frozen=True)
class ParsedRow:
    trans_date: date
    post_date: date | None
    amount: Decimal
    description: str
    issuer_category: str | None
    is_payment: bool
    fingerprint: str
    merchant_key: str
    source: str


@dataclass(frozen=True)
class ParseResult:
    source: str
    rows: tuple[ParsedRow, ...]
    warnings: tuple[str, ...] = ()

    @property
    def importable(self) -> tuple[ParsedRow, ...]:
        return tuple(r for r in self.rows if not r.is_payment)

    @property
    def payments(self) -> tuple[ParsedRow, ...]:
        return tuple(r for r in self.rows if r.is_payment)


class ParseError(ValueError):
    """CSV could not be parsed as a known statement format."""


def _norm_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _parse_date(raw: str) -> date | None:
    text = raw.strip()
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(raw: str) -> Decimal | None:
    text = raw.strip()
    if not text:
        return None
    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]
    text = text.replace("$", "").replace(",", "").replace(" ", "")
    if not text or text == "-":
        return None
    try:
        value = Decimal(text).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None
    if negative:
        value = -value
    return value


def is_card_payment(description: str, issuer_category: str | None) -> bool:
    """True for card-bill transfers, not merchant refunds."""
    if _PAYMENT_RE.search(description or ""):
        return True
    cat = (issuer_category or "").strip().lower()
    if cat in {"payments and credits", "payment"} and "payment" in (description or "").lower():
        return True
    return False


def _map_headers(row: list[str]) -> dict[str, int] | None:
    mapped: dict[str, int] = {}
    for idx, cell in enumerate(row):
        key = _HEADER_ALIASES.get(_norm_header(cell))
        if key:
            mapped[key] = idx
    if {"trans_date", "description", "amount"} <= mapped.keys():
        return mapped
    return None


def _looks_discover(headers: dict[str, int], filename: str) -> bool:
    name = filename.lower()
    if "discover" in name:
        return True
    return "post_date" in headers and "issuer_category" in headers


def detect_source(text: str, filename: str = "") -> str | None:
    reader = csv.reader(io.StringIO(text))
    for i, row in enumerate(reader):
        if i > 25:
            break
        if not row or all(not c.strip() for c in row):
            continue
        headers = _map_headers(row)
        if headers is None:
            continue
        if _looks_discover(headers, filename):
            return ImportSource.discover.value
        # Headers match the Discover-shaped activity file even without the name.
        if "post_date" in headers:
            return ImportSource.discover.value
        return ImportSource.discover.value
    return None


def parse_statement(text: str, filename: str = "") -> ParseResult:
    source = detect_source(text, filename)
    if source is None:
        raise ParseError(
            "Could not detect a supported statement CSV. "
            "Discover activity files need Trans. Date, Description, and Amount columns."
        )
    if source == ImportSource.discover.value:
        return parse_discover(text, filename=filename)
    raise ParseError(f"No parser registered for source {source!r}")


def parse_discover(text: str, filename: str = "") -> ParseResult:
    reader = csv.reader(io.StringIO(text))
    headers: dict[str, int] | None = None
    rows: list[ParsedRow] = []
    warnings: list[str] = []
    skipped = 0

    for i, raw in enumerate(reader):
        if not raw or all(not c.strip() for c in raw):
            continue
        if headers is None:
            mapped = _map_headers(raw)
            if mapped is not None:
                headers = mapped
            continue
        trans_raw = raw[headers["trans_date"]].strip() if headers["trans_date"] < len(raw) else ""
        trans_date = _parse_date(trans_raw)
        amount_raw = raw[headers["amount"]].strip() if headers["amount"] < len(raw) else ""
        amount = _parse_amount(amount_raw)
        desc_idx = headers["description"]
        description = raw[desc_idx].strip() if desc_idx < len(raw) else ""
        if trans_date is None or amount is None or not description:
            skipped += 1
            continue
        post_date = None
        if "post_date" in headers and headers["post_date"] < len(raw):
            post_date = _parse_date(raw[headers["post_date"]])
        issuer_category = None
        if "issuer_category" in headers and headers["issuer_category"] < len(raw):
            issuer_category = raw[headers["issuer_category"]].strip() or None
        description = description[:512]
        key = merchant_key(description)
        rows.append(
            ParsedRow(
                trans_date=trans_date,
                post_date=post_date,
                amount=amount,
                description=description,
                issuer_category=issuer_category[:128] if issuer_category else None,
                is_payment=is_card_payment(description, issuer_category),
                fingerprint=row_fingerprint(
                    source=ImportSource.discover.value,
                    account_key=ImportSource.discover.value,
                    trans_date=trans_date,
                    amount=amount,
                    description=description,
                ),
                merchant_key=key,
                source=ImportSource.discover.value,
            )
        )

    if headers is None:
        raise ParseError(
            "This does not look like a Discover activity CSV. "
            "Expected a header row with Trans. Date, Description, and Amount."
        )
    if skipped:
        warnings.append(f"Skipped {skipped} unreadable row(s).")
    _ = filename
    return ParseResult(
        source=ImportSource.discover.value,
        rows=tuple(rows),
        warnings=tuple(warnings),
    )
