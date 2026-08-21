"""Dashboard insight aggregations derived from the in-memory user ledger.

Keep this off the SQL path: annual already walks 12 months in Python. Insights
that need a full year (heatmap, savings history) run once at the end.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.enums import CategoryKind
from app.models import Category, RecurringSchedule, Transaction
from app.schemas import (
    CategoryMonthCell,
    CategoryProgress,
    DashboardTransactionOut,
    FlexibleSplitOut,
    MonthlyTrendPoint,
    PaycheckLeftoverOut,
    RecurringLoadItem,
    SavingsBucketOut,
    SavingsHistoryPoint,
    SavingsHistorySeries,
    SpendingRunwayOut,
    TradeoffSuggestion,
)
from app.services.coach import expense_is_committed
from app.services.recurring import occurrences_in_month

ZERO = Decimal("0.00")
MONEY = Decimal("0.01")
MIN_MOVE = Decimal("1.00")
TOP_N = 8
_MONTH_NAMES = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY)


def _kind_totals_point(
    ledger: object,
    year: int,
    month: int,
    categories: list[Category],
) -> MonthlyTrendPoint | None:
    """Sum planned + actuals for one calendar month from a UserLedger."""
    from app.services.dashboard import UserLedger

    if not isinstance(ledger, UserLedger):
        return None
    start, end = date(year, month, 1), date(year, month, monthrange(year, month)[1])
    budget = ledger.budget_months.get((year, month))
    if budget is None and (year, month) not in ledger._actuals_by_month:
        return None
    planned = {
        line.category_id: line.planned_amount for line in (budget.lines if budget else [])
    }
    actuals = ledger.actuals_between(start, end)
    income_p = income_a = expense_p = expense_a = savings_p = savings_a = ZERO
    by_id = {c.id: c for c in categories}
    ids = set(planned) | set(actuals)
    for cid in ids:
        cat = by_id.get(cid)
        if cat is None:
            continue
        p = planned.get(cid, ZERO)
        a = actuals.get(cid, ZERO)
        if cat.kind in (CategoryKind.income.value, CategoryKind.expense.value):
            a = abs(a)
        if cat.kind == CategoryKind.income.value:
            income_p += p
            income_a += a
        elif cat.kind == CategoryKind.expense.value:
            expense_p += p
            expense_a += a
        else:
            savings_p += p
            savings_a += a
    return MonthlyTrendPoint(
        year=year,
        month=month,
        income_planned=_money(income_p),
        income_actual=_money(income_a),
        expense_planned=_money(expense_p),
        expense_actual=_money(expense_a),
        savings_planned=_money(savings_p),
        savings_actual=_money(savings_a),
    )


def mark_committed(rows: list[CategoryProgress]) -> list[CategoryProgress]:
    expense_plans = [r.planned for r in rows if r.kind == CategoryKind.expense]
    out: list[CategoryProgress] = []
    for row in rows:
        if row.kind != CategoryKind.expense:
            out.append(row)
            continue
        committed = expense_is_committed(
            row.category_name,
            row.planned,
            expense_plans=expense_plans,
            funded=row.funded_by_category_id is not None,
        )
        out.append(row.model_copy(update={"committed": committed}))
    return out


def build_top_transactions(
    txs: list[Transaction],
    *,
    start: date,
    end: date,
    limit: int = TOP_N,
) -> list[DashboardTransactionOut]:
    window = [tx for tx in txs if start <= tx.date <= end]
    window.sort(key=lambda tx: abs(tx.amount), reverse=True)
    out: list[DashboardTransactionOut] = []
    for tx in window[:limit]:
        cat = tx.category
        if cat is None:
            continue
        amount = tx.amount
        if cat.kind in (CategoryKind.income.value, CategoryKind.expense.value):
            amount = abs(amount)
        out.append(
            DashboardTransactionOut(
                id=tx.id,
                category_id=tx.category_id,
                category_name=cat.name,
                kind=CategoryKind(cat.kind),
                amount=_money(amount),
                date=tx.date,
                note=tx.note,
            )
        )
    return out


def build_recurring_load(
    schedules: list[RecurringSchedule],
    progress: list[CategoryProgress],
    *,
    year: int,
    month: int,
) -> list[RecurringLoadItem]:
    by_cat = {r.category_id: r for r in progress}
    items: list[RecurringLoadItem] = []
    for sched in schedules:
        dates = occurrences_in_month(sched, year, month)
        if not dates:
            continue
        cat = sched.category
        if cat is None:
            continue
        row = by_cat.get(sched.category_id)
        remaining = row.remaining if row is not None else ZERO
        logged = row.actual if row is not None else ZERO
        items.append(
            RecurringLoadItem(
                schedule_id=sched.id,
                category_id=sched.category_id,
                category_name=cat.name,
                kind=CategoryKind(cat.kind),
                amount=_money(abs(sched.amount)),
                note=sched.note,
                next_occurrence=sched.next_occurrence,
                occurrences_this_period=len(dates),
                remaining_in_category=_money(remaining),
                logged_this_period=_money(logged),
            )
        )
    items.sort(key=lambda i: (i.next_occurrence, i.category_name))
    return items


def build_runway(
    *,
    today: date,
    year: int,
    month: int,
    expense_planned: Decimal,
    expense_actual: Decimal,
) -> SpendingRunwayOut:
    days_in_month = monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, days_in_month)
    if today < month_start:
        elapsed = 0
        left = days_in_month
        as_of = month_start
    elif today > month_end:
        elapsed = days_in_month
        left = 0
        as_of = month_end
    else:
        elapsed = today.day
        left = days_in_month - today.day
        as_of = today
    remaining = expense_planned - expense_actual
    daily_spent = (
        _money(expense_actual / Decimal(elapsed)) if elapsed > 0 else ZERO
    )
    daily_remaining = (
        _money(remaining / Decimal(left)) if left > 0 else remaining
    )
    ahead = (
        elapsed > 0
        and expense_planned > ZERO
        and expense_actual > expense_planned * Decimal(elapsed) / Decimal(days_in_month)
    )
    return SpendingRunwayOut(
        as_of=as_of,
        days_in_month=days_in_month,
        days_elapsed=elapsed,
        days_left=left,
        expense_planned=_money(expense_planned),
        expense_actual=_money(expense_actual),
        expense_remaining=_money(remaining),
        daily_spent=daily_spent,
        daily_remaining=_money(daily_remaining) if left > 0 else ZERO,
        ahead=ahead,
        has_data=expense_planned > ZERO or expense_actual > ZERO,
    )


def build_flexible_split(
    rows: list[CategoryProgress],
    leftover_planned: PaycheckLeftoverOut,
    leftover_actual: PaycheckLeftoverOut,
) -> FlexibleSplitOut:
    committed_p = committed_a = flexible_p = flexible_a = funded_p = funded_a = ZERO
    savings_p = savings_a = ZERO
    for row in rows:
        if row.kind == CategoryKind.savings:
            savings_p += row.planned
            savings_a += row.actual
            continue
        if row.kind != CategoryKind.expense:
            continue
        if row.funded_by_category_id:
            funded_p += row.planned
            funded_a += row.actual
        elif row.committed:
            committed_p += row.planned
            committed_a += row.actual
        else:
            flexible_p += row.planned
            flexible_a += row.actual
    return FlexibleSplitOut(
        committed_planned=_money(committed_p),
        committed_actual=_money(committed_a),
        flexible_planned=_money(flexible_p),
        flexible_actual=_money(flexible_a),
        funded_planned=_money(funded_p),
        funded_actual=_money(funded_a),
        savings_planned=_money(savings_p),
        savings_actual=_money(savings_a),
        leftover_planned=_money(leftover_planned.leftover),
        leftover_actual=_money(leftover_actual.leftover),
    )


def _hit_label(year: int | None, month: int | None) -> str | None:
    if year is None or month is None:
        return None
    return f"{_MONTH_NAMES[month - 1]} {year}"


def build_tradeoffs(
    rows: list[CategoryProgress],
    buckets: list[SavingsBucketOut],
    *,
    apply_year: int,
    apply_month: int,
) -> list[TradeoffSuggestion]:
    """Move unused flexible plan (or leftover) into an unmet savings target."""
    from app.services.dashboard import project_savings_hit

    sources = [
        r
        for r in rows
        if r.kind == CategoryKind.expense
        and not r.committed
        and not r.funded_by_category_id
        and r.remaining >= MIN_MOVE
        and r.planned > ZERO
    ]
    sources.sort(key=lambda r: r.remaining, reverse=True)
    dests = [
        b
        for b in buckets
        if b.target_amount is not None
        and not b.target_reached
        and b.target_amount > ZERO
    ]
    dests.sort(
        key=lambda b: (
            (b.target_amount or ZERO) - b.balance,
            b.category_name,
        )
    )
    if not sources or not dests:
        return []
    source = sources[0]
    dest = dests[0]
    amount = min(source.remaining, source.planned - MIN_MOVE)
    if amount < MIN_MOVE:
        return []
    amount = _money(amount)
    new_source = _money(source.planned - amount)
    new_dest = _money(dest.planned_this_period + amount)
    _, hit_y, hit_m = project_savings_hit(
        balance=dest.balance,
        target=dest.target_amount,
        monthly_contribution=dest.monthly_contribution,
        from_year=apply_year,
        from_month=apply_month,
    )
    _, after_y, after_m = project_savings_hit(
        balance=dest.balance,
        target=dest.target_amount,
        monthly_contribution=new_dest,
        from_year=apply_year,
        from_month=apply_month,
    )
    hit_before = _hit_label(hit_y, hit_m)
    hit_after = _hit_label(after_y, after_m)
    extra = ""
    if hit_before and hit_after and hit_after != hit_before:
        extra = f" Target hit moves from {hit_before} to {hit_after}."
    elif hit_after and not hit_before:
        extra = f" Target then projects {hit_after}."
    message = (
        f"Lower {source.category_name} by ${amount} and raise "
        f"{dest.category_name} by the same amount.{extra} Optional — never required."
    )
    return [
        TradeoffSuggestion(
            source_category_id=source.category_id,
            source_category_name=source.category_name,
            unused_planned=amount,
            dest_category_id=dest.category_id,
            dest_category_name=dest.category_name,
            dest_target_amount=dest.target_amount,
            current_source_planned=_money(source.planned),
            current_dest_planned=_money(dest.planned_this_period),
            suggested_source_planned=new_source,
            suggested_dest_planned=new_dest,
            apply_year=apply_year,
            apply_month=apply_month,
            hit_before=hit_before,
            hit_after=hit_after,
            message=message,
        )
    ]


def build_category_month_cells(category_accum: dict[UUID, dict]) -> list[CategoryMonthCell]:
    cells: list[CategoryMonthCell] = []
    for cid, data in category_accum.items():
        for sample in data.get("samples") or []:
            cells.append(
                CategoryMonthCell(
                    category_id=cid,
                    category_name=data["name"],
                    kind=data["kind"],
                    month=sample["month"],
                    planned=_money(sample["planned"]),
                    actual=_money(sample["actual"]),
                )
            )
    cells.sort(key=lambda c: (c.kind.value, c.category_name, c.month))
    return cells


def build_savings_history(
    ledger: object,
    buckets: list[SavingsBucketOut],
    *,
    year: int,
) -> list[SavingsHistorySeries]:
    from app.services.dashboard import UserLedger

    if not isinstance(ledger, UserLedger):
        return []
    series: list[SavingsHistorySeries] = []
    for bucket in buckets:
        points: list[SavingsHistoryPoint] = []
        for month in range(1, 13):
            end = date(year, month, monthrange(year, month)[1])
            start = date(year, month, 1)
            deposits, withdrawals = ledger.savings_flows_between(start, end)
            points.append(
                SavingsHistoryPoint(
                    month=month,
                    balance=_money(ledger.savings_balances_as_of(end).get(bucket.category_id, ZERO)),
                    contribution=_money(deposits.get(bucket.category_id, ZERO)),
                    withdrawal=_money(withdrawals.get(bucket.category_id, ZERO)),
                )
            )
        series.append(
            SavingsHistorySeries(
                category_id=bucket.category_id,
                category_name=bucket.category_name,
                target_amount=bucket.target_amount,
                points=points,
            )
        )
    return series


def build_period_compare(
    ledger: object,
    categories: list[Category],
    *,
    year: int,
    month: int,
) -> tuple[MonthlyTrendPoint | None, MonthlyTrendPoint | None]:
    if month == 1:
        last = _kind_totals_point(ledger, year - 1, 12, categories)
    else:
        last = _kind_totals_point(ledger, year, month - 1, categories)
    prior = _kind_totals_point(ledger, year - 1, month, categories)
    return last, prior


def build_prior_year_totals(
    ledger: object,
    categories: list[Category],
    *,
    year: int,
) -> MonthlyTrendPoint | None:
    income_p = income_a = expense_p = expense_a = savings_p = savings_a = ZERO
    any_data = False
    for month in range(1, 13):
        point = _kind_totals_point(ledger, year - 1, month, categories)
        if point is None:
            continue
        any_data = True
        income_p += point.income_planned
        income_a += point.income_actual
        expense_p += point.expense_planned
        expense_a += point.expense_actual
        savings_p += point.savings_planned
        savings_a += point.savings_actual
    if not any_data:
        return None
    return MonthlyTrendPoint(
        year=year - 1,
        month=12,
        income_planned=_money(income_p),
        income_actual=_money(income_a),
        expense_planned=_money(expense_p),
        expense_actual=_money(expense_a),
        savings_planned=_money(savings_p),
        savings_actual=_money(savings_a),
    )
