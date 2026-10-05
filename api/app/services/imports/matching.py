"""Rounding-aware fuzzy match of import rows against existing tracker entries.

Tight windows (this version): amount within $1, date within 2 days, same sign.
A second pass flags a same-payee tip gap: the imported charge is higher than
the logged amount by at least $2 and by 15–30%, still within 2 days.
Do not auto-merge — two real $12 coffees on the same day must stay distinct.
Loose dollar windows stay documented here for a later confirmation pile.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from app.services.imports.fingerprints import (
    merchant_key,
    merchant_keys_related,
    merchant_tokens,
)

# High-confidence inbox flag (covers nearest-dollar rounding + posted vs purchase).
TIGHT_AMOUNT_WINDOW = Decimal("1.00")
TIGHT_DATE_WINDOW_DAYS = 2

# Pre-tip authorization vs posted check. Narrow on purpose: a flat dollar
# window would flag unrelated meals, and a 2% band is rounding, not a tip.
# Same payee, posted higher, gap of at least $2 and 15–30%, within 2 days.
TIP_MIN_DELTA = Decimal("2.00")
TIP_MIN_RATIO = Decimal("0.15")
TIP_MAX_RATIO = Decimal("0.30")
TIP_TARGET_RATIO = Decimal("0.20")
TIP_DATE_WINDOW_DAYS = TIGHT_DATE_WINDOW_DAYS
# Two logged amounts this close to the same posted total are too alike to guess.
TIP_AMBIGUITY = Decimal("0.02")

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
    # Already linked to an import. A tip suggestion against it cannot merge.
    already_imported: bool = False


@dataclass(frozen=True)
class DuplicateLikelihood:
    """How strongly an inbox row resembles one tracker entry.

    ``score`` is 0–100. ``level`` is the band the inbox shows:
    high (very likely), medium (likely), low (possible).
    """

    level: str
    score: int
    label: str
    reason: str


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


def _as_fuzzy(tx: LedgerRow, amount: Decimal, trans_date: date) -> FuzzyMatch:
    return FuzzyMatch(
        transaction_id=tx.id,
        date=tx.date,
        amount=tx.amount,
        note=tx.note,
        category_id=tx.category_id,
        category_name=tx.category_name,
        amount_delta=abs(abs(amount) - abs(tx.amount)),
        date_delta_days=abs((tx.date - trans_date).days),
    )


@dataclass(frozen=True)
class _TipPair:
    distance: Decimal
    date_delta: int
    overlap: int
    index: int
    tx: LedgerRow
    posted: Decimal
    trans_date: date


def assign_tip_matches(
    candidates: list[tuple[object, date, Decimal, str]],
    ledger: list[LedgerRow],
    *,
    skip_indexes: set[int] | None = None,
    skip_transaction_ids: set[UUID] | None = None,
) -> dict[int, FuzzyMatch]:
    """1-to-1 matches for a pre-tip log vs the posted charge.

    Requires a strong payee, a posted amount at least $2 and 15–30% higher,
    and a date within 2 days. Skips a row when two logged amounts are similarly
    plausible, and prefers the gap closer to 20% when one posted total could
    fit two imports. Never matches a charge that is already imported.
    """
    if not candidates or not ledger:
        return {}
    skipped_idx = skip_indexes or set()
    skipped_tx = skip_transaction_ids or set()
    dates = [c[1] for c in candidates]
    start = min(dates) - timedelta(days=TIP_DATE_WINDOW_DAYS)
    end = max(dates) + timedelta(days=TIP_DATE_WINDOW_DAYS)
    pool = [
        tx
        for tx in ledger
        if start <= tx.date <= end and tx.id not in skipped_tx and not tx.already_imported
    ]
    if not pool:
        return {}

    pairs: list[_TipPair] = []
    for idx, (_obj, trans_date, amount, description) in enumerate(candidates):
        if idx in skipped_idx or amount <= 0:
            continue
        for tx in pool:
            ratio = tip_ratio(amount, tx.amount)
            if ratio is None:
                continue
            date_delta = abs((tx.date - trans_date).days)
            if date_delta > TIP_DATE_WINDOW_DAYS:
                continue
            if _payee_strength(description, tx.note) != "strong":
                continue
            overlap = len(
                merchant_tokens(merchant_key(description))
                & merchant_tokens(merchant_key(tx.note or ""))
            )
            pairs.append(
                _TipPair(
                    distance=abs(ratio - TIP_TARGET_RATIO),
                    date_delta=date_delta,
                    overlap=overlap,
                    index=idx,
                    tx=tx,
                    posted=amount,
                    trans_date=trans_date,
                )
            )
    if not pairs:
        return {}

    by_index: dict[int, list[_TipPair]] = {}
    for pair in pairs:
        by_index.setdefault(pair.index, []).append(pair)

    ambiguous: set[int] = set()
    for idx, opts in by_index.items():
        opts.sort(key=lambda pair: (pair.distance, pair.date_delta, -pair.overlap))
        if len(opts) < 2:
            continue
        best, second = opts[0], opts[1]
        ratio_close = second.distance - best.distance <= TIP_AMBIGUITY
        # A nearer date breaks the tie. Two same-day amounts do not.
        date_tie = second.date_delta <= best.date_delta
        if ratio_close and date_tie:
            ambiguous.add(idx)

    ordered = [pair for pair in pairs if pair.index not in ambiguous]
    ordered.sort(key=lambda pair: (pair.distance, pair.date_delta, -pair.overlap, pair.index))
    used_tx: set[UUID] = set()
    used_idx: set[int] = set()
    assigned: dict[int, FuzzyMatch] = {}
    for pair in ordered:
        if pair.index in used_idx or pair.tx.id in used_tx:
            continue
        used_idx.add(pair.index)
        used_tx.add(pair.tx.id)
        assigned[pair.index] = _as_fuzzy(pair.tx, pair.posted, pair.trans_date)
    return assigned


def assign_inbox_matches(
    candidates: list[tuple[object, date, Decimal, str]],
    ledger: list[LedgerRow],
    *,
    amount_window: Decimal = TIGHT_AMOUNT_WINDOW,
    date_window_days: int = TIGHT_DATE_WINDOW_DAYS,
) -> dict[int, FuzzyMatch]:
    """Tight rounding matches first, then tip gaps on whatever is left."""
    tight = assign_fuzzy_matches(
        candidates,
        ledger,
        amount_window=amount_window,
        date_window_days=date_window_days,
    )
    tip = assign_tip_matches(
        candidates,
        ledger,
        skip_indexes=set(tight),
        skip_transaction_ids={match.transaction_id for match in tight.values()},
    )
    return {**tight, **tip}


def _payee_strength(description: str, note: str | None) -> str:
    left = merchant_key(description)
    right = merchant_key(note or "")
    if merchant_keys_related(left, right):
        return "strong"
    overlap = merchant_tokens(left) & merchant_tokens(right)
    if len(overlap) >= 2:
        return "strong"
    if len(overlap) == 1:
        return "weak"
    return "none"


def tip_ratio(posted: Decimal, manual: Decimal) -> Decimal | None:
    """Gap as a fraction of the logged amount, when it looks like a tip.

    The imported charge must be a positive amount strictly above the logged
    expense. The difference must be at least $2 and between 15% and 30%.
    A lower posted amount, a refund, or a coffee-sized gap is not a tip.
    """
    if posted <= 0 or manual <= 0 or posted <= manual:
        return None
    delta = posted - manual
    if delta < TIP_MIN_DELTA:
        return None
    ratio = delta / manual
    if ratio < TIP_MIN_RATIO or ratio > TIP_MAX_RATIO:
        return None
    return ratio


def _likelihood_reason(
    amount_delta: Decimal,
    date_delta: int,
    payee: str,
    *,
    tip: Decimal | None = None,
) -> str:
    if tip is not None:
        pct = (tip * Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        amount_bit = f"Amount looks like a tip ({pct}% higher)"
    elif amount_delta == 0:
        amount_bit = "Exact amount"
    elif amount_delta <= Decimal("0.50"):
        amount_bit = "Amount within 50¢"
    elif amount_delta <= TIGHT_AMOUNT_WINDOW:
        amount_bit = "Amount within $1"
    else:
        amount_bit = "Amount differs by more than $1"
    if date_delta <= 0:
        date_bit = "same day"
    elif date_delta == 1:
        date_bit = "1 day apart"
    else:
        date_bit = f"{date_delta} days apart"
    if payee == "strong":
        payee_bit = "similar payee"
    elif payee == "weak":
        payee_bit = "payee partly matches"
    else:
        payee_bit = "payee looks different"
    return f"{amount_bit} · {date_bit} · {payee_bit}"


def rate_duplicate(
    *,
    trans_date: date,
    amount: Decimal,
    description: str,
    tx_date: date,
    tx_amount: Decimal,
    tx_note: str | None,
) -> DuplicateLikelihood:
    """Score one inbox row against one tracker entry.

    Payee similarity carries the most weight. A rounded manual amount on a
    nearby day for the same chain is very likely the same charge. Close dollars
    with an unrelated note stay in the possible band.
    """
    amount_delta = abs(abs(amount) - abs(tx_amount))
    date_delta = abs((tx_date - trans_date).days)
    payee = _payee_strength(description, tx_note)
    # A tip gap scores no amount points, so same-day + strong payee stays
    # "Likely" (70) instead of "Very likely". The inbox still asks.
    tip = tip_ratio(amount, tx_amount)
    if date_delta > TIP_DATE_WINDOW_DAYS:
        tip = None

    if amount_delta == 0:
        amount_pts = 30
    elif amount_delta <= Decimal("0.50"):
        amount_pts = 20
    elif amount_delta <= TIGHT_AMOUNT_WINDOW:
        amount_pts = 10
    else:
        amount_pts = 0

    if date_delta <= 0:
        date_pts = 25
    elif date_delta == 1:
        date_pts = 15
    elif date_delta == 2:
        date_pts = 6
    else:
        date_pts = 0

    payee_pts = {"strong": 45, "weak": 22, "none": 0}[payee]
    score = amount_pts + date_pts + payee_pts
    if score >= 75:
        level, label = "high", "Very likely"
    elif score >= 50:
        level, label = "medium", "Likely"
    else:
        level, label = "low", "Possible"
    return DuplicateLikelihood(
        level=level,
        score=score,
        label=label,
        reason=_likelihood_reason(amount_delta, date_delta, payee, tip=tip),
    )
