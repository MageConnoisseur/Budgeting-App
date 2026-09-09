"""Rounding-aware fuzzy match of import rows against existing tracker entries.

Tight windows (this version): amount within $1, date within 2 days, same sign.
Do not auto-merge — two real $12 coffees on the same day must stay distinct.
Loose windows stay documented here for a later confirmation pile.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from app.services.imports.fingerprints import merchant_key, merchant_tokens

# High-confidence inbox flag (covers nearest-dollar rounding + posted vs purchase).
TIGHT_AMOUNT_WINDOW = Decimal("1.00")
TIGHT_DATE_WINDOW_DAYS = 2

# Future “possible duplicate” pile — not applied automatically.
LOOSE_AMOUNT_WINDOW = Decimal("5.00")
LOOSE_DATE_WINDOW_DAYS = 5


@dataclass(frozen=True)
class LedgerRow:
    id: UUID
    date: date
    amount: Decimal
    note: str | None
    category_id: UUID
    category_name: str


@dataclass(frozen=True)
class FuzzyMatch:
    transaction_id: UUID
    date: date
    amount: Decimal
    note: str | None
    category_id: UUID
    category_name: str
    amount_delta: Decimal
    date_delta_days: int


def _same_sign(left: Decimal, right: Decimal) -> bool:
    if left == 0 or right == 0:
        return False
    return (left > 0) == (right > 0)


def score_match(
    *,
    trans_date: date,
    amount: Decimal,
    description: str,
    tx: LedgerRow,
    amount_window: Decimal = TIGHT_AMOUNT_WINDOW,
    date_window_days: int = TIGHT_DATE_WINDOW_DAYS,
) -> tuple[Decimal, int, int] | None:
    """Return a sort key (amount_delta, date_delta, -token_overlap) or None."""
    if not _same_sign(amount, tx.amount):
        return None
    amount_delta = abs(abs(amount) - abs(tx.amount))
    date_delta = abs((tx.date - trans_date).days)
    if amount_delta > amount_window or date_delta > date_window_days:
        return None
    overlap = len(
        merchant_tokens(merchant_key(description))
        & merchant_tokens(merchant_key(tx.note or ""))
    )
    return (amount_delta, date_delta, -overlap)


def assign_fuzzy_matches(
    candidates: list[tuple[object, date, Decimal, str]],
    ledger: list[LedgerRow],
    *,
    amount_window: Decimal = TIGHT_AMOUNT_WINDOW,
    date_window_days: int = TIGHT_DATE_WINDOW_DAYS,
) -> dict[int, FuzzyMatch]:
    """Greedy 1-to-1 matches so two similar real purchases stay distinguishable.

    ``candidates`` is (opaque, trans_date, amount, description); the dict is
    keyed by index into that list.
    """
    if not candidates or not ledger:
        return {}

    dates = [c[1] for c in candidates]
    start = min(dates) - timedelta(days=date_window_days)
    end = max(dates) + timedelta(days=date_window_days)
    pool = [tx for tx in ledger if start <= tx.date <= end]
    used: set[UUID] = set()
    assigned: dict[int, FuzzyMatch] = {}

    indexed = list(enumerate(candidates))
    indexed.sort(key=lambda item: (item[1][1], abs(item[1][2]), item[0]))

    for idx, (_obj, trans_date, amount, description) in indexed:
        best: tuple[tuple[Decimal, int, int], LedgerRow] | None = None
        for tx in pool:
            if tx.id in used:
                continue
            scored = score_match(
                trans_date=trans_date,
                amount=amount,
                description=description,
                tx=tx,
                amount_window=amount_window,
                date_window_days=date_window_days,
            )
            if scored is None:
                continue
            if best is None or scored < best[0]:
                best = (scored, tx)
        if best is None:
            continue
        _score, tx = best
        used.add(tx.id)
        assigned[idx] = FuzzyMatch(
            transaction_id=tx.id,
            date=tx.date,
            amount=tx.amount,
            note=tx.note,
            category_id=tx.category_id,
            category_name=tx.category_name,
            amount_delta=abs(abs(amount) - abs(tx.amount)),
            date_delta_days=abs((tx.date - trans_date).days),
        )
    return assigned
