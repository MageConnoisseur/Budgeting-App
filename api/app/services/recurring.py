"""Recurring schedule helpers: next dates, pattern detection, income estimates."""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.enums import CategoryKind, RecurrenceFrequency
from app.models import BudgetLine, BudgetMonth, Category, RecurringSchedule, Transaction, User

ZERO = Decimal("0.00")
CENT = Decimal("0.01")


def _money(value: Decimal | float | int) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def _clamp_dom(year: int, month: int, day: int) -> date:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(max(day, 1), last))


def next_occurrence_on_or_after(
    *,
    frequency: RecurrenceFrequency | str,
    anchor_day: int,
    start_date: date,
    on_or_after: date,
) -> date:
    """Compute the next schedule date on or after `on_or_after`."""
    freq = (
        frequency
        if isinstance(frequency, RecurrenceFrequency)
        else RecurrenceFrequency(frequency)
    )
    cursor = max(start_date, on_or_after)

    if freq == RecurrenceFrequency.monthly:
        day = min(max(anchor_day, 1), 28)
        candidate = _clamp_dom(cursor.year, cursor.month, day)
        if candidate < cursor:
            if cursor.month == 12:
                candidate = _clamp_dom(cursor.year + 1, 1, day)
            else:
                candidate = _clamp_dom(cursor.year, cursor.month + 1, day)
        return candidate

    if freq == RecurrenceFrequency.semimonthly:
        # Fixed 1st and 15th of each month.
        y, m = cursor.year, cursor.month
        for day in (1, 15):
            candidate = date(y, m, day)
            if candidate >= cursor and candidate >= start_date:
                return candidate
        if m == 12:
            return date(y + 1, 1, 1)
        return date(y, m + 1, 1)

    # weekly / biweekly — ISO weekday 1=Mon … 7=Sun
    weekday = min(max(anchor_day, 1), 7)
    step = 7 if freq == RecurrenceFrequency.weekly else 14

    # Align to the first matching weekday on/after start_date.
    first = start_date
    while first.isoweekday() != weekday:
        first += timedelta(days=1)

    if cursor <= first:
        return first

    delta_days = (cursor - first).days
    cycles = delta_days // step
    candidate = first + timedelta(days=cycles * step)
    if candidate < cursor:
        candidate += timedelta(days=step)
    return candidate


def advance_occurrence(
    schedule: RecurringSchedule,
    *,
    after: date | None = None,
) -> date:
    """Move to the occurrence strictly after `after` (default: current next)."""
    base = after if after is not None else schedule.next_occurrence
    return next_occurrence_on_or_after(
        frequency=schedule.frequency,
        anchor_day=schedule.anchor_day,
        start_date=schedule.start_date,
        on_or_after=base + timedelta(days=1),
    )


def validate_anchor_day(frequency: RecurrenceFrequency | str, anchor_day: int) -> int:
    freq = (
        frequency
        if isinstance(frequency, RecurrenceFrequency)
        else RecurrenceFrequency(frequency)
    )
    if freq in (RecurrenceFrequency.weekly, RecurrenceFrequency.biweekly):
        if anchor_day < 1 or anchor_day > 7:
            raise ValueError("anchor_day must be 1–7 (ISO weekday) for weekly/biweekly")
    elif freq == RecurrenceFrequency.monthly:
        if anchor_day < 1 or anchor_day > 28:
            raise ValueError("anchor_day must be 1–28 for monthly")
    # semimonthly ignores anchor_day
    return anchor_day


def occurrences_in_month(
    schedule: RecurringSchedule,
    year: int,
    month: int,
) -> list[date]:
    """List schedule occurrence dates falling in the given calendar month."""
    start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end = date(year, month, last_day)
    if schedule.end_date and schedule.end_date < start:
        return []
    if schedule.start_date > end:
        return []

    out: list[date] = []
    cursor = next_occurrence_on_or_after(
        frequency=schedule.frequency,
        anchor_day=schedule.anchor_day,
        start_date=schedule.start_date,
        on_or_after=start,
    )
    while cursor <= end:
        if schedule.end_date and cursor > schedule.end_date:
            break
        out.append(cursor)
        cursor = next_occurrence_on_or_after(
            frequency=schedule.frequency,
            anchor_day=schedule.anchor_day,
            start_date=schedule.start_date,
            on_or_after=cursor + timedelta(days=1),
        )
    return out


def _infer_frequency(avg_interval: float) -> tuple[RecurrenceFrequency, str]:
    if 5.5 <= avg_interval <= 9.5:
        return RecurrenceFrequency.weekly, "high" if 6.5 <= avg_interval <= 7.5 else "medium"
    if 12 <= avg_interval <= 17:
        return RecurrenceFrequency.biweekly, "high" if 13 <= avg_interval <= 15 else "medium"
    if 13.5 <= avg_interval <= 16.5:
        # overlapping with biweekly; prefer biweekly above
        return RecurrenceFrequency.biweekly, "medium"
    if 26 <= avg_interval <= 35:
        return RecurrenceFrequency.monthly, "high" if 28 <= avg_interval <= 32 else "medium"
    if 14.5 <= avg_interval <= 16.5:
        return RecurrenceFrequency.semimonthly, "low"
    return RecurrenceFrequency.monthly, "low"


def detect_patterns(
    db: Session,
    user: User,
    *,
    lookback_months: int = 6,
    min_samples: int = 3,
) -> list[dict]:
    """Find income/expense categories that look recurring from tracker history."""
    today = date.today()
    # Approximate lookback window.
    start_month = today.month - lookback_months
    start_year = today.year
    while start_month <= 0:
        start_month += 12
        start_year -= 1
    window_start = date(start_year, start_month, 1)

    rows = db.scalars(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(
            Transaction.user_id == user.id,
            Transaction.date >= window_start,
        )
        .order_by(Transaction.date.asc())
    ).all()

    # Existing active schedules — skip those categories for suggestions.
    scheduled_cats = set(
        db.scalars(
            select(RecurringSchedule.category_id).where(
                RecurringSchedule.user_id == user.id,
                RecurringSchedule.active.is_(True),
            )
        ).all()
    )

    by_cat: dict[UUID, list[Transaction]] = defaultdict(list)
    for tx in rows:
        if tx.category is None:
            continue
        if tx.category.kind not in (
            CategoryKind.income.value,
            CategoryKind.expense.value,
        ):
            continue
        if tx.category_id in scheduled_cats:
            continue
        by_cat[tx.category_id].append(tx)

    suggestions: list[dict] = []
    for category_id, txs in by_cat.items():
        if len(txs) < min_samples:
            continue
        # Use absolute amounts for consistency.
        amounts = [abs(Decimal(t.amount)) for t in txs]
        dates = [t.date for t in txs]
        intervals = [
            (dates[i] - dates[i - 1]).days for i in range(1, len(dates)) if (dates[i] - dates[i - 1]).days > 0
        ]
        if len(intervals) < min_samples - 1:
            continue
        avg_interval = sum(intervals) / len(intervals)
        if avg_interval < 5 or avg_interval > 40:
            continue

        # Amount stability: median ± 20%.
        med_amt = Decimal(median(amounts))
        if med_amt <= 0:
            continue
        stable = sum(1 for a in amounts if abs(a - med_amt) / med_amt <= Decimal("0.20"))
        if stable < min_samples:
            continue

        freq, confidence = _infer_frequency(avg_interval)
        # Semimonthly heuristic: ~2 per month with ~15 day gaps.
        per_month: dict[tuple[int, int], int] = defaultdict(int)
        for d in dates:
            per_month[(d.year, d.month)] += 1
        if (
            len(per_month) >= 2
            and sum(1 for c in per_month.values() if c >= 2) >= 2
            and 13 <= avg_interval <= 17
        ):
            freq = RecurrenceFrequency.semimonthly
            confidence = "medium"

        last = dates[-1]
        if freq in (RecurrenceFrequency.weekly, RecurrenceFrequency.biweekly):
            anchor = last.isoweekday()
        elif freq == RecurrenceFrequency.monthly:
            anchor = min(last.day, 28)
        else:
            anchor = 1

        cat = txs[0].category
        kind = CategoryKind(cat.kind)
        note = next((t.note for t in reversed(txs) if t.note), None)
        label = "income" if kind == CategoryKind.income else "expense"
        suggestions.append(
            {
                "category_id": category_id,
                "category_name": cat.name,
                "kind": kind,
                "suggested_amount": _money(med_amt),
                "suggested_frequency": freq,
                "suggested_anchor_day": anchor,
                "sample_count": len(txs),
                "average_interval_days": _money(Decimal(str(round(avg_interval, 2)))),
                "last_date": last,
                "sample_note": note,
                "confidence": confidence if confidence in ("low", "medium", "high") else "low",
                "message": (
                    f"{cat.name} looks like recurring {label} "
                    f"(~every {round(avg_interval):.0f} days, "
                    f"about {_money(med_amt)}). Add a schedule?"
                ),
            }
        )

    # Prefer higher confidence / more samples.
    rank = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda s: (rank.get(s["confidence"], 9), -s["sample_count"]))
    return suggestions[:15]


def estimate_income_for_month(
    db: Session,
    user: User,
    *,
    year: int,
    month: int,
    history_months: int = 6,
) -> dict:
    """Estimate income for a calendar month from schedules + tracker patterns."""
    income_cats = db.scalars(
        select(Category).where(
            Category.user_id == user.id,
            Category.kind == CategoryKind.income.value,
        )
    ).all()
    cat_by_id = {c.id: c for c in income_cats}

    schedules = db.scalars(
        select(RecurringSchedule)
        .options(joinedload(RecurringSchedule.category))
        .where(
            RecurringSchedule.user_id == user.id,
            RecurringSchedule.active.is_(True),
        )
    ).all()
    income_schedules = [
        s
        for s in schedules
        if s.category is not None and s.category.kind == CategoryKind.income.value
    ]

    # Historical monthly totals per category.
    start_month = month - history_months
    start_year = year
    while start_month <= 0:
        start_month += 12
        start_year -= 1
    window_start = date(start_year, start_month, 1)
    target_start = date(year, month, 1)

    txs = db.scalars(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(
            Transaction.user_id == user.id,
            Transaction.date >= window_start,
            Transaction.date < target_start,
        )
    ).all()

    monthly_by_cat: dict[UUID, dict[tuple[int, int], Decimal]] = defaultdict(
        lambda: defaultdict(lambda: ZERO)
    )
    for tx in txs:
        if tx.category is None or tx.category.kind != CategoryKind.income.value:
            continue
        key = (tx.date.year, tx.date.month)
        monthly_by_cat[tx.category_id][key] += abs(Decimal(tx.amount))

    # Planned + actual for the target month.
    budget = db.scalar(
        select(BudgetMonth).where(
            BudgetMonth.user_id == user.id,
            BudgetMonth.year == year,
            BudgetMonth.month == month,
        )
    )
    planned_total = ZERO
    if budget:
        lines = db.scalars(
            select(BudgetLine)
            .join(Category, Category.id == BudgetLine.category_id)
            .where(
                BudgetLine.budget_month_id == budget.id,
                Category.kind == CategoryKind.income.value,
            )
        ).all()
        planned_total = _money(sum((Decimal(l.planned_amount) for l in lines), ZERO))

    last_day = calendar.monthrange(year, month)[1]
    actual_rows = db.scalars(
        select(Transaction)
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.user_id == user.id,
            Category.kind == CategoryKind.income.value,
            Transaction.date >= target_start,
            Transaction.date <= date(year, month, last_day),
        )
    ).all()
    actual_to_date = _money(sum((abs(Decimal(t.amount)) for t in actual_rows), ZERO))

    categories_out: list[dict] = []
    based_on_schedules = 0
    based_on_history = 0
    estimated_total = ZERO
    handled: set[UUID] = set()

    for sched in income_schedules:
        occ = occurrences_in_month(sched, year, month)
        if not occ:
            continue
        amount = _money(Decimal(sched.amount) * len(occ))
        cat = sched.category
        assert cat is not None
        categories_out.append(
            {
                "category_id": cat.id,
                "category_name": cat.name,
                "estimated_amount": amount,
                "method": "schedule",
                "occurrence_count": len(occ),
                "sample_months": 0,
                "message": (
                    f"{len(occ)}× {_money(Decimal(sched.amount))} "
                    f"from {sched.frequency} schedule"
                ),
            }
        )
        estimated_total += amount
        based_on_schedules += 1
        handled.add(cat.id)

    for cat_id, months_map in monthly_by_cat.items():
        if cat_id in handled:
            # Soft-mix: if history differs a lot, keep schedule but note — skip for v1.
            continue
        cat = cat_by_id.get(cat_id)
        if cat is None:
            continue
        values = [_money(v) for v in months_map.values() if v > 0]
        if not values:
            continue
        med = _money(Decimal(median(values)))
        mean = _money(sum(values) / len(values))
        # Prefer median (robust to one-off bonuses).
        estimate = med
        method = "history_median"
        if abs(med - mean) / max(med, CENT) > Decimal("0.25"):
            # High variance — still report median but flag as mean-aware.
            method = "history_mean" if len(values) >= 4 else "history_median"
            if method == "history_mean":
                estimate = mean
        categories_out.append(
            {
                "category_id": cat.id,
                "category_name": cat.name,
                "estimated_amount": estimate,
                "method": method,
                "occurrence_count": 0,
                "sample_months": len(values),
                "message": (
                    f"Based on {len(values)} prior month"
                    f"{'s' if len(values) != 1 else ''} "
                    f"({method.replace('_', ' ')})"
                ),
            }
        )
        estimated_total += estimate
        based_on_history += 1

    categories_out.sort(key=lambda c: c["estimated_amount"], reverse=True)
    estimated_total = _money(estimated_total)

    if not categories_out:
        message = (
            "Not enough tracker income history or schedules to estimate this month yet."
        )
    else:
        message = (
            f"Estimated income for {year}-{month:02d}: {estimated_total} "
            f"({based_on_schedules} schedule"
            f"{'s' if based_on_schedules != 1 else ''}, "
            f"{based_on_history} from history)."
        )

    return {
        "year": year,
        "month": month,
        "estimated_total": estimated_total,
        "planned_total": planned_total,
        "actual_to_date": actual_to_date,
        "categories": categories_out,
        "based_on_schedules": based_on_schedules,
        "based_on_history": based_on_history,
        "message": message,
    }
