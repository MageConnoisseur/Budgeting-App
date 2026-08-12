"""Dashboard plan-vs-actual aggregations (soft over-budget warnings only)."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.enums import CategoryKind
from app.models import BudgetMonth, Category, Transaction, User
from app.schemas import (
    AnnualDashboardOut,
    CategoryProgress,
    CategoryTrend,
    KindTotals,
    MonthlyDashboardOut,
    MonthlyTrendPoint,
    SavingsBucketOut,
    SpendingPaceDay,
    SpendingPaceOut,
)
from app.services.budget import get_or_create_month

ZERO = Decimal("0.00")
MONEY = Decimal("0.01")
# Rolling actuals window and income-average lookback (calendar-day based).
PACE_WINDOW_DAYS = 30
INCOME_LOOKBACK_DAYS = 183  # ~6 months; shorter if the user has less history


def _month_date_range(year: int, month: int) -> tuple[date, date]:
    last = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


def _kind_totals(rows: list[CategoryProgress]) -> KindTotals:
    planned = sum((r.planned for r in rows), ZERO)
    actual = sum((r.actual for r in rows), ZERO)
    remaining = planned - actual
    return KindTotals(
        planned=planned,
        actual=actual,
        remaining=remaining,
        over_budget=actual > planned and planned > ZERO,
    )


def _actuals_by_category(
    db: Session, user_id: UUID, start: date, end: date
) -> dict[UUID, Decimal]:
    txs = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
    ).all()
    totals: dict[UUID, Decimal] = {}
    for tx in txs:
        totals[tx.category_id] = totals.get(tx.category_id, ZERO) + tx.amount
    return totals


def _planned_by_category(budget_month: BudgetMonth | None) -> dict[UUID, Decimal]:
    if budget_month is None:
        return {}
    return {line.category_id: line.planned_amount for line in budget_month.lines}


def _load_budget_month(
    db: Session, user: User, year: int, month: int, *, ensure: bool
) -> BudgetMonth | None:
    if ensure:
        budget_month, _ = get_or_create_month(db, user, year, month, auto_seed=True)
        return budget_month
    return db.scalar(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines))
        .where(
            BudgetMonth.user_id == user.id,
            BudgetMonth.year == year,
            BudgetMonth.month == month,
        )
    )


def savings_balances(db: Session, user_id: UUID, as_of: date | None = None) -> dict[UUID, Decimal]:
    """Running ledger balance per savings category (derived, not materialized)."""
    q = (
        select(Transaction)
        .join(Category)
        .where(
            Transaction.user_id == user_id,
            Category.kind == CategoryKind.savings.value,
        )
    )
    if as_of is not None:
        q = q.where(Transaction.date <= as_of)
    txs = db.scalars(q).all()
    balances: dict[UUID, Decimal] = {}
    for tx in txs:
        balances[tx.category_id] = balances.get(tx.category_id, ZERO) + tx.amount
    return balances


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def _first_tracking_date(db: Session, user_id: UUID) -> date | None:
    return db.scalar(
        select(func.min(Transaction.date)).where(Transaction.user_id == user_id)
    )


def _empty_spending_pace(as_of: date) -> SpendingPaceOut:
    start = as_of - timedelta(days=PACE_WINDOW_DAYS - 1)
    return SpendingPaceOut(
        as_of=as_of,
        window_start=start,
        window_end=as_of,
        window_days=PACE_WINDOW_DAYS,
        income=ZERO,
        expense=ZERO,
        savings=ZERO,
        outflow=ZERO,
        net=ZERO,
        average_daily_income=ZERO,
        expected_income=ZERO,
        income_lookback_start=None,
        income_lookback_end=None,
        income_lookback_days=0,
        tracking_started_on=None,
        overspending=False,
        has_data=False,
        days=[],
    )


def build_spending_pace(db: Session, user: User, as_of: date) -> SpendingPaceOut:
    """Rolling actual income/expense/savings vs average income capacity.

    Uses the last ~30 days of actuals (clamped to the first tracking day so new
    users are not compared against empty pre-history). Income capacity is the
    average daily income since tracking began, looking back at most ~6 months.
    Soft overspending when window outflow (expenses + net savings) exceeds that
    expected income for the same number of days.
    """
    tracking_started = _first_tracking_date(db, user.id)
    if tracking_started is None or tracking_started > as_of:
        return _empty_spending_pace(as_of)

    raw_window_start = as_of - timedelta(days=PACE_WINDOW_DAYS - 1)
    window_start = max(raw_window_start, tracking_started)
    window_end = as_of
    window_days = (window_end - window_start).days + 1

    lookback_floor = as_of - timedelta(days=INCOME_LOOKBACK_DAYS - 1)
    income_lookback_start = max(tracking_started, lookback_floor)
    income_lookback_end = as_of
    income_lookback_days = (income_lookback_end - income_lookback_start).days + 1

    # Load every transaction needed for lookback income + the pace window.
    load_start = min(income_lookback_start, window_start)
    txs = db.scalars(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(
            Transaction.user_id == user.id,
            Transaction.date >= load_start,
            Transaction.date <= as_of,
        )
        .order_by(Transaction.date.asc())
    ).unique().all()

    income_lookback_total = ZERO
    daily: dict[date, dict[str, Decimal]] = {}
    cursor = window_start
    while cursor <= window_end:
        daily[cursor] = {"income": ZERO, "expense": ZERO, "savings": ZERO}
        cursor += timedelta(days=1)

    for tx in txs:
        kind = tx.category.kind
        if kind == CategoryKind.income.value:
            amount = abs(tx.amount)
            if income_lookback_start <= tx.date <= income_lookback_end:
                income_lookback_total += amount
            if window_start <= tx.date <= window_end:
                daily[tx.date]["income"] += amount
        elif kind == CategoryKind.expense.value:
            amount = abs(tx.amount)
            if window_start <= tx.date <= window_end:
                daily[tx.date]["expense"] += amount
        elif kind == CategoryKind.savings.value:
            if window_start <= tx.date <= window_end:
                daily[tx.date]["savings"] += tx.amount

    avg_daily_raw = (
        income_lookback_total / Decimal(income_lookback_days)
        if income_lookback_days > 0
        else ZERO
    )
    avg_daily = _money(avg_daily_raw)
    # Scale lookback income to the window length without intermediate drift.
    expected_income = (
        _money(
            income_lookback_total
            * Decimal(window_days)
            / Decimal(income_lookback_days)
        )
        if income_lookback_days > 0
        else ZERO
    )

    days_out: list[SpendingPaceDay] = []
    cum_income = ZERO
    cum_expense = ZERO
    cum_savings = ZERO
    ordered_dates = sorted(daily.keys())
    for i, day in enumerate(ordered_dates):
        bucket = daily[day]
        cum_income += bucket["income"]
        cum_expense += bucket["expense"]
        cum_savings += bucket["savings"]
        cum_outflow = cum_expense + cum_savings
        day_count = i + 1
        expected_to_date = (
            _money(
                income_lookback_total
                * Decimal(day_count)
                / Decimal(income_lookback_days)
            )
            if income_lookback_days > 0
            else ZERO
        )
        days_out.append(
            SpendingPaceDay(
                date=day,
                income=_money(bucket["income"]),
                expense=_money(bucket["expense"]),
                savings=_money(bucket["savings"]),
                cumulative_income=_money(cum_income),
                cumulative_expense=_money(cum_expense),
                cumulative_savings=_money(cum_savings),
                cumulative_outflow=_money(cum_outflow),
                cumulative_net=_money(cum_income - cum_expense - cum_savings),
                cumulative_expected_income=expected_to_date,
            )
        )

    income_total = _money(cum_income)
    expense_total = _money(cum_expense)
    savings_total = _money(cum_savings)
    outflow = _money(expense_total + savings_total)
    net = _money(income_total - expense_total - savings_total)
    overspending = expected_income > ZERO and outflow > expected_income

    return SpendingPaceOut(
        as_of=as_of,
        window_start=window_start,
        window_end=window_end,
        window_days=window_days,
        income=income_total,
        expense=expense_total,
        savings=savings_total,
        outflow=outflow,
        net=net,
        average_daily_income=avg_daily,
        expected_income=expected_income,
        income_lookback_start=income_lookback_start,
        income_lookback_end=income_lookback_end,
        income_lookback_days=income_lookback_days,
        tracking_started_on=tracking_started,
        overspending=overspending,
        has_data=True,
        days=days_out,
    )


def build_monthly_dashboard(
    db: Session,
    user: User,
    year: int,
    month: int,
    *,
    ensure_month: bool = True,
    include_pace: bool = True,
) -> MonthlyDashboardOut:
    budget_month = _load_budget_month(db, user, year, month, ensure=ensure_month)
    start, end = _month_date_range(year, month)
    planned = _planned_by_category(budget_month)
    actuals = _actuals_by_category(db, user.id, start, end)

    categories = db.scalars(
        select(Category)
        .where(Category.user_id == user.id, Category.archived.is_(False))
        .order_by(Category.kind, Category.sort_order, Category.name)
    ).all()

    progress: list[CategoryProgress] = []
    for cat in categories:
        p = planned.get(cat.id, ZERO)
        a = actuals.get(cat.id, ZERO)
        if cat.kind in (CategoryKind.income.value, CategoryKind.expense.value):
            a = abs(a)
        remaining = p - a
        if cat.kind == CategoryKind.income.value:
            over_budget = a < p and p > ZERO
        else:
            over_budget = a > p and (p > ZERO or a > ZERO)
        progress.append(
            CategoryProgress(
                category_id=cat.id,
                category_name=cat.name,
                kind=CategoryKind(cat.kind),
                planned=p,
                actual=a,
                remaining=remaining,
                over_budget=over_budget,
            )
        )

    by_kind = {
        CategoryKind.income: [r for r in progress if r.kind == CategoryKind.income],
        CategoryKind.expense: [r for r in progress if r.kind == CategoryKind.expense],
        CategoryKind.savings: [r for r in progress if r.kind == CategoryKind.savings],
    }

    balances = savings_balances(db, user.id, as_of=end)
    savings_cats = [c for c in categories if c.kind == CategoryKind.savings.value]
    buckets = [
        SavingsBucketOut(
            category_id=c.id,
            category_name=c.name,
            balance=balances.get(c.id, ZERO),
            planned_this_period=planned.get(c.id, ZERO),
            actual_this_period=actuals.get(c.id, ZERO),
            over_budget=actuals.get(c.id, ZERO) > planned.get(c.id, ZERO)
            and (planned.get(c.id, ZERO) > ZERO or actuals.get(c.id, ZERO) > ZERO),
        )
        for c in savings_cats
    ]

    if include_pace:
        # Pace is "current health" as of today, or the month end when browsing history.
        as_of = min(date.today(), end)
        spending_pace = build_spending_pace(db, user, as_of)
    else:
        spending_pace = _empty_spending_pace(min(date.today(), end))

    return MonthlyDashboardOut(
        year=year,
        month=month,
        income=_kind_totals(by_kind[CategoryKind.income]),
        expense=_kind_totals(by_kind[CategoryKind.expense]),
        savings=_kind_totals(by_kind[CategoryKind.savings]),
        categories=progress,
        savings_buckets=buckets,
        spending_pace=spending_pace,
    )


def build_annual_dashboard(db: Session, user: User, year: int) -> AnnualDashboardOut:
    """Year view — reads existing months only (does not auto-seed all 12)."""
    months: list[MonthlyTrendPoint] = []
    category_accum: dict[UUID, dict] = {}

    for month in range(1, 13):
        md = build_monthly_dashboard(
            db, user, year, month, ensure_month=False, include_pace=False
        )
        months.append(
            MonthlyTrendPoint(
                year=year,
                month=month,
                income_planned=md.income.planned,
                income_actual=md.income.actual,
                expense_planned=md.expense.planned,
                expense_actual=md.expense.actual,
                savings_planned=md.savings.planned,
                savings_actual=md.savings.actual,
            )
        )
        for row in md.categories:
            slot = category_accum.setdefault(
                row.category_id,
                {
                    "name": row.category_name,
                    "kind": row.kind,
                    "over": 0,
                    "under": 0,
                    "planned": ZERO,
                    "actual": ZERO,
                },
            )
            slot["planned"] += row.planned
            slot["actual"] += row.actual
            if row.over_budget:
                slot["over"] += 1
            elif row.planned > ZERO and row.actual < row.planned:
                slot["under"] += 1

    trends = [
        CategoryTrend(
            category_id=cid,
            category_name=data["name"],
            kind=data["kind"],
            months_over_budget=data["over"],
            months_under_budget=data["under"],
            total_planned=data["planned"],
            total_actual=data["actual"],
        )
        for cid, data in category_accum.items()
    ]
    trends.sort(key=lambda t: (-t.months_over_budget, t.category_name))

    def sum_kind(attr_planned: str, attr_actual: str) -> KindTotals:
        planned = sum((getattr(m, attr_planned) for m in months), ZERO)
        actual = sum((getattr(m, attr_actual) for m in months), ZERO)
        return KindTotals(
            planned=planned,
            actual=actual,
            remaining=planned - actual,
            over_budget=actual > planned and planned > ZERO,
        )

    year_end = date(year, 12, 31)
    balances = savings_balances(db, user.id, as_of=year_end)
    savings_cats = db.scalars(
        select(Category).where(
            Category.user_id == user.id,
            Category.kind == CategoryKind.savings.value,
            Category.archived.is_(False),
        )
    ).all()
    buckets = [
        SavingsBucketOut(
            category_id=c.id,
            category_name=c.name,
            balance=balances.get(c.id, ZERO),
            planned_this_period=ZERO,
            actual_this_period=ZERO,
            over_budget=False,
        )
        for c in savings_cats
    ]
    for b in buckets:
        if b.category_id in category_accum:
            data = category_accum[b.category_id]
            b.planned_this_period = data["planned"]
            b.actual_this_period = data["actual"]
            b.over_budget = data["actual"] > data["planned"] and (
                data["planned"] > ZERO or data["actual"] > ZERO
            )

    as_of = min(date.today(), date(year, 12, 31))
    spending_pace = build_spending_pace(db, user, as_of)

    return AnnualDashboardOut(
        year=year,
        months=months,
        category_trends=trends,
        income=sum_kind("income_planned", "income_actual"),
        expense=sum_kind("expense_planned", "expense_actual"),
        savings=sum_kind("savings_planned", "savings_actual"),
        savings_buckets=buckets,
        spending_pace=spending_pace,
    )
