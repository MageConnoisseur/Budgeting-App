"""Dashboard plan-vs-actual aggregations (soft over-budget warnings only)."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.enums import CategoryKind
from app.models import BudgetMonth, Category, RecurringSchedule, Transaction, User
from app.services.funding import (
    MONTH_LOAD_OPTIONS,
    add_leftovers,
    funding_by_expense,
    paycheck_leftover,
    planned_use_by_bucket,
)
from app.schemas import (
    AnnualDashboardOut,
    CategoryProgress,
    CategoryTrend,
    KindTotals,
    MonthlyDashboardOut,
    MonthlyTrendPoint,
    MonthActualsOut,
    PlanSuggestion,
    SavingsBucketOut,
    SpendingPaceDay,
    SpendingPaceOut,
    YearActualsOut,
)
from app.services.budget import get_or_create_month
from app.services.category_health import build_category_health_scores
from app.services.coach import CoachLine, build_budget_coach
from app.services.dashboard_insights import (
    build_flexible_split,
    build_category_month_cells,
    build_period_compare,
    build_prior_year_totals,
    build_recurring_load,
    build_runway,
    build_savings_history,
    build_top_transactions,
    build_tradeoffs,
    mark_committed,
)
from app.services.recurring import occurrences_in_month

ZERO = Decimal("0.00")
MONEY = Decimal("0.01")
# Rolling actuals window and income-average lookback (calendar-day based).
PACE_WINDOW_DAYS = 30
INCOME_LOOKBACK_DAYS = 183  # ~6 months; shorter if the user has less history
PLAN_SUGGESTION_MIN_OVER_MONTHS = 3
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


def _fill_actual(kind: str, amount: Decimal) -> Decimal | None:
    """Amount that should grow a budget-cell fill for this category kind.

    Income/expense use absolute logged amounts. Savings uses contributions
    (positive) only — withdrawals are bucket *use*, not progress vs the
    contribution plan.
    """
    if kind == CategoryKind.savings.value:
        return amount if amount > ZERO else None
    return abs(amount) if amount != ZERO else None


def build_year_actuals(db: Session, user: User, year: int) -> YearActualsOut:
    """Compact actuals for the budget planner (monthly + annual cell fills)."""
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    txs = (
        db.scalars(
            select(Transaction)
            .options(joinedload(Transaction.category))
            .where(
                Transaction.user_id == user.id,
                Transaction.date >= start,
                Transaction.date <= end,
            )
        )
        .unique()
        .all()
    )
    by_month: dict[int, dict[str, Decimal]] = {m: {} for m in range(1, 13)}
    for tx in txs:
        kind = tx.category.kind if tx.category is not None else ""
        add = _fill_actual(kind, tx.amount)
        if add is None:
            continue
        bucket = by_month[tx.date.month]
        key = str(tx.category_id)
        bucket[key] = bucket.get(key, ZERO) + add
    return YearActualsOut(
        year=year,
        months=[
            MonthActualsOut(
                month=m,
                actuals={
                    cid: _money(amount)
                    for cid, amount in by_month[m].items()
                    if amount != ZERO
                },
            )
            for m in range(1, 13)
        ],
    )


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
        .options(*MONTH_LOAD_OPTIONS)
        .where(
            BudgetMonth.user_id == user.id,
            BudgetMonth.year == year,
            BudgetMonth.month == month,
        )
    )


@dataclass
class UserLedger:
    """In-memory copy of one user's plan + ledger for dashboard assembly.

    Opening the dashboard used to hit Postgres once per month (and several
    times per month) because the annual view called ``build_monthly_dashboard``
    12 times. Each round trip to hosted Postgres dominates; row count does not.
    Load this snapshot in a handful of queries, then slice it in Python.
    """

    categories: list[Category]
    budget_months: dict[tuple[int, int], BudgetMonth]
    transactions: list[Transaction]
    recurring: list[RecurringSchedule]
    _actuals_by_month: dict[tuple[int, int], dict[UUID, Decimal]] = field(init=False)
    _savings_by_date: list[tuple[date, UUID, Decimal]] = field(init=False)

    def __post_init__(self) -> None:
        actuals: dict[tuple[int, int], dict[UUID, Decimal]] = {}
        savings: list[tuple[date, UUID, Decimal]] = []
        for tx in self.transactions:
            key = (tx.date.year, tx.date.month)
            bucket = actuals.setdefault(key, {})
            bucket[tx.category_id] = bucket.get(tx.category_id, ZERO) + tx.amount
            if tx.category.kind == CategoryKind.savings.value:
                savings.append((tx.date, tx.category_id, tx.amount))
        self._actuals_by_month = actuals
        self._savings_by_date = savings

    def actuals_between(self, start: date, end: date) -> dict[UUID, Decimal]:
        last = monthrange(start.year, start.month)[1]
        if (
            start.day == 1
            and start.year == end.year
            and start.month == end.month
            and end.day == last
        ):
            return dict(self._actuals_by_month.get((start.year, start.month), {}))
        totals: dict[UUID, Decimal] = {}
        for tx in self.transactions:
            if start <= tx.date <= end:
                totals[tx.category_id] = totals.get(tx.category_id, ZERO) + tx.amount
        return totals

    def savings_balances_as_of(self, as_of: date | None = None) -> dict[UUID, Decimal]:
        totals: dict[UUID, Decimal] = {}
        for tx_date, cid, amount in self._savings_by_date:
            if as_of is not None and tx_date > as_of:
                continue
            totals[cid] = totals.get(cid, ZERO) + amount
        return totals

    def savings_flows_between(
        self, start: date, end: date
    ) -> tuple[dict[UUID, Decimal], dict[UUID, Decimal]]:
        deposits: dict[UUID, Decimal] = {}
        withdrawals: dict[UUID, Decimal] = {}
        for tx_date, cid, amount in self._savings_by_date:
            if tx_date < start or tx_date > end:
                continue
            if amount > ZERO:
                deposits[cid] = deposits.get(cid, ZERO) + amount
            elif amount < ZERO:
                withdrawals[cid] = withdrawals.get(cid, ZERO) + (-amount)
        return deposits, withdrawals

    def income_paydays(self, year: int, month: int) -> dict[UUID, list[date]]:
        out: dict[UUID, list[date]] = {}
        for sched in self.recurring:
            kind = sched.category.kind if sched.category is not None else None
            if kind != CategoryKind.income.value:
                continue
            dates = occurrences_in_month(sched, year, month)
            if dates:
                out.setdefault(sched.category_id, []).extend(dates)
        for cid, dates in out.items():
            out[cid] = sorted(set(dates))
        return out

    def latest_contribution(
        self, category_id: UUID, *, year: int, month: int
    ) -> Decimal:
        rows: list[tuple[int, int, Decimal]] = []
        for (y, m), budget_month in self.budget_months.items():
            for line in budget_month.lines:
                if line.category_id == category_id:
                    rows.append((y, m, line.planned_amount))
        rows.sort(key=lambda row: (row[0], row[1]), reverse=True)
        target_key = (year, month)
        prior: Decimal | None = None
        for y, m, amount in rows:
            key = (y, m)
            if key == target_key:
                return _money(amount)
            if key < target_key and prior is None:
                prior = _money(amount)
        return prior if prior is not None else ZERO

    def first_tracking_date(self) -> date | None:
        return self.transactions[0].date if self.transactions else None


def load_user_ledger(db: Session, user: User) -> UserLedger:
    """Load categories, plans, transactions, and schedules in four queries."""
    categories = db.scalars(
        select(Category)
        .where(Category.user_id == user.id, Category.archived.is_(False))
        .order_by(Category.kind, Category.sort_order, Category.name)
    ).all()
    months = (
        db.scalars(
            select(BudgetMonth)
            .options(*MONTH_LOAD_OPTIONS)
            .where(BudgetMonth.user_id == user.id)
        )
        .unique()
        .all()
    )
    txs = (
        db.scalars(
            select(Transaction)
            .options(joinedload(Transaction.category))
            .where(Transaction.user_id == user.id)
            .order_by(Transaction.date.asc(), Transaction.created_at.asc())
        )
        .unique()
        .all()
    )
    recurring = (
        db.scalars(
            select(RecurringSchedule)
            .options(joinedload(RecurringSchedule.category))
            .where(
                RecurringSchedule.user_id == user.id,
                RecurringSchedule.active.is_(True),
            )
        )
        .unique()
        .all()
    )
    return UserLedger(
        categories=list(categories),
        budget_months={(m.year, m.month): m for m in months},
        transactions=list(txs),
        recurring=list(recurring),
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


def project_savings_hit(
    *,
    balance: Decimal,
    target: Decimal | None,
    monthly_contribution: Decimal,
    from_year: int,
    from_month: int,
) -> tuple[bool, int | None, int | None]:
    """Project when a savings target is reached at a steady monthly contribution.

    Returns ``(target_reached, hit_year, hit_month)``.
    Hit month assumes the first contribution lands in ``from_year/from_month``.
    """
    if target is None or target <= ZERO:
        return False, None, None
    bal = _money(balance)
    tgt = _money(target)
    if bal >= tgt:
        return True, from_year, from_month
    contrib = _money(monthly_contribution)
    if contrib <= ZERO:
        return False, None, None
    remaining = tgt - bal
    months_needed = int(
        (remaining / contrib).to_integral_value(rounding=ROUND_CEILING)
    )
    if months_needed < 1:
        months_needed = 1
    # After N contributions starting this month → offset N-1 months ahead.
    total = from_month - 1 + (months_needed - 1)
    hit_year = from_year + total // 12
    hit_month = total % 12 + 1
    return False, hit_year, hit_month


def latest_monthly_contribution(
    db: Session,
    user_id: UUID,
    category_id: UUID,
    *,
    year: int,
    month: int,
) -> Decimal:
    """Planned contribution for year/month, else most recent prior month's plan."""
    from app.models import BudgetLine

    rows = db.execute(
        select(BudgetMonth.year, BudgetMonth.month, BudgetLine.planned_amount)
        .join(BudgetLine, BudgetLine.budget_month_id == BudgetMonth.id)
        .where(
            BudgetMonth.user_id == user_id,
            BudgetLine.category_id == category_id,
        )
        .order_by(BudgetMonth.year.desc(), BudgetMonth.month.desc())
    ).all()
    target_key = (year, month)
    prior: Decimal | None = None
    for y, m, amount in rows:
        key = (y, m)
        if key == target_key:
            return _money(amount)
        if key < target_key and prior is None:
            prior = _money(amount)
    return prior if prior is not None else ZERO


def build_savings_bucket(
    *,
    category: Category,
    balance: Decimal,
    planned_this_period: Decimal,
    actual_this_period: Decimal,
    monthly_contribution: Decimal,
    from_year: int,
    from_month: int,
    planned_use_this_period: Decimal = ZERO,
    actual_use_this_period: Decimal = ZERO,
    actual_contributed_this_period: Decimal | None = None,
) -> SavingsBucketOut:
    contributed = (
        actual_contributed_this_period
        if actual_contributed_this_period is not None
        else actual_this_period
    )
    over = contributed > planned_this_period and (
        planned_this_period > ZERO or contributed > ZERO
    )
    use = _money(planned_use_this_period)
    reached, hit_year, hit_month = project_savings_hit(
        balance=balance,
        target=category.target_amount,
        monthly_contribution=monthly_contribution,
        from_year=from_year,
        from_month=from_month,
    )
    return SavingsBucketOut(
        category_id=category.id,
        category_name=category.name,
        balance=_money(balance),
        planned_this_period=_money(planned_this_period),
        actual_this_period=_money(actual_this_period),
        over_budget=over,
        target_amount=category.target_amount,
        target_reached=reached,
        projected_hit_year=hit_year,
        projected_hit_month=hit_month,
        monthly_contribution=_money(monthly_contribution),
        planned_use_this_period=use,
        actual_use_this_period=_money(actual_use_this_period),
        use_over_balance=use > _money(balance) and use > ZERO,
    )


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def _median_money(values: list[Decimal]) -> Decimal:
    """Median of money amounts; even counts average the two middle values."""
    if not values:
        return ZERO
    ordered = sorted(values)
    n = len(ordered)
    mid = n // 2
    if n % 2 == 1:
        return _money(ordered[mid])
    return _money((ordered[mid - 1] + ordered[mid]) / 2)


def _apply_target_for_suggestion(
    year: int,
    samples: list[dict],
    *,
    today: date,
) -> tuple[int, int, Decimal]:
    """Pick the month to raise and a sensible current planned baseline."""
    if year == today.year:
        apply_month = today.month
    else:
        with_plan = [s for s in samples if s["planned"] > ZERO]
        apply_month = max((s["month"] for s in with_plan), default=12)

    apply_sample = next((s for s in samples if s["month"] == apply_month), None)
    current = apply_sample["planned"] if apply_sample else ZERO
    if current <= ZERO:
        with_plan = [s for s in samples if s["planned"] > ZERO]
        if with_plan:
            latest = max(with_plan, key=lambda s: s["month"])
            current = latest["planned"]
    return year, apply_month, _money(current)


def build_plan_suggestions(
    year: int,
    category_accum: dict[UUID, dict],
    *,
    today: date | None = None,
) -> list[PlanSuggestion]:
    """Soft coaching: median raise or seasonal tip after 3+ overrun months."""
    as_of = today or date.today()
    suggestions: list[PlanSuggestion] = []

    for cid, data in category_accum.items():
        kind: CategoryKind = data["kind"]
        if kind not in (CategoryKind.expense, CategoryKind.savings):
            continue

        samples: list[dict] = data.get("samples") or []
        over_samples = [
            s
            for s in samples
            if s["over"] and s["planned"] > ZERO
        ]
        if len(over_samples) < PLAN_SUGGESTION_MIN_OVER_MONTHS:
            continue

        months_with_plan = [s for s in samples if s["planned"] > ZERO]
        non_over = [s for s in months_with_plan if not s["over"]]
        over_months_sorted = sorted(s["month"] for s in over_samples)
        span = over_months_sorted[-1] - over_months_sorted[0] + 1
        # Single-year seasonal: a short contiguous overrun cluster (not chronic).
        is_seasonal = (
            len(non_over) >= 1
            and span == len(over_samples)
            and len(over_samples) <= 4
        )

        if is_seasonal:
            month_labels = ", ".join(
                _MONTH_NAMES[m - 1] for m in over_months_sorted
            )
            suggestions.append(
                PlanSuggestion(
                    category_id=cid,
                    category_name=data["name"],
                    kind=kind,
                    suggestion_kind="seasonal",
                    months_over=len(over_samples),
                    median_overrun=None,
                    apply_year=None,
                    apply_month=None,
                    current_planned=None,
                    suggested_planned=None,
                    message=(
                        f"This looks seasonal — overruns cluster in {month_labels}. "
                        "Consider a higher plan only in those months."
                    ),
                )
            )
            continue

        overruns = [_money(s["actual"] - s["planned"]) for s in over_samples]
        median = _median_money(overruns)
        apply_year, apply_month, current_planned = _apply_target_for_suggestion(
            year, samples, today=as_of
        )
        suggested = _money(current_planned + median)
        suggestions.append(
            PlanSuggestion(
                category_id=cid,
                category_name=data["name"],
                kind=kind,
                suggestion_kind="median_raise",
                months_over=len(over_samples),
                median_overrun=median,
                apply_year=apply_year,
                apply_month=apply_month,
                current_planned=current_planned,
                suggested_planned=suggested,
                message=(
                    f"Raise plan by ${median} (median overrun over "
                    f"{len(over_samples)} months)."
                ),
            )
        )

    suggestions.sort(
        key=lambda s: (
            0 if s.suggestion_kind == "median_raise" else 1,
            -s.months_over,
            s.category_name,
        )
    )
    return suggestions


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


def _assemble_spending_pace(
    *,
    as_of: date,
    tracking_started: date | None,
    txs: list[Transaction],
) -> SpendingPaceOut:
    """Build spending pace from already-loaded transactions."""
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

    income_lookback_total = ZERO
    daily: dict[date, dict[str, Decimal]] = {}
    cursor = window_start
    while cursor <= window_end:
        daily[cursor] = {"income": ZERO, "expense": ZERO, "savings": ZERO}
        cursor += timedelta(days=1)

    for tx in txs:
        if tx.date > as_of:
            continue
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

    lookback_floor = as_of - timedelta(days=INCOME_LOOKBACK_DAYS - 1)
    income_lookback_start = max(tracking_started, lookback_floor)
    raw_window_start = as_of - timedelta(days=PACE_WINDOW_DAYS - 1)
    window_start = max(raw_window_start, tracking_started)
    load_start = min(income_lookback_start, window_start)
    txs = (
        db.scalars(
            select(Transaction)
            .options(joinedload(Transaction.category))
            .where(
                Transaction.user_id == user.id,
                Transaction.date >= load_start,
                Transaction.date <= as_of,
            )
            .order_by(Transaction.date.asc())
        )
        .unique()
        .all()
    )
    return _assemble_spending_pace(
        as_of=as_of, tracking_started=tracking_started, txs=list(txs)
    )


def income_shortfall_is_due(
    *,
    month_start: date,
    month_end: date,
    today: date,
    payday_dates: list[date],
) -> bool:
    """Income under-plan is overrun only after expected pay dates have passed.

    Future months never flag. The current month waits until every scheduled
    payday in that month is strictly in the past (or, with no schedule, until
    the month has ended).
    """
    if today > month_end:
        return True
    if today < month_start:
        return False
    if not payday_dates:
        return False
    upcoming = [d for d in payday_dates if d >= today]
    past = [d for d in payday_dates if d < today]
    return len(upcoming) == 0 and len(past) > 0


def _income_paydays_in_month(
    db: Session, user_id: UUID, year: int, month: int
) -> dict[UUID, list[date]]:
    rows = db.scalars(
        select(RecurringSchedule)
        .join(Category)
        .where(
            RecurringSchedule.user_id == user_id,
            RecurringSchedule.active.is_(True),
            Category.kind == CategoryKind.income.value,
        )
    ).all()
    out: dict[UUID, list[date]] = {}
    for sched in rows:
        dates = occurrences_in_month(sched, year, month)
        if dates:
            out.setdefault(sched.category_id, []).extend(dates)
    for cid, dates in out.items():
        out[cid] = sorted(set(dates))
    return out


def _monthly_from_ledger(
    ledger: UserLedger,
    year: int,
    month: int,
    *,
    include_pace: bool,
    include_insights: bool = False,
    today: date,
) -> MonthlyDashboardOut:
    """Assemble one month of dashboard insight from a preloaded ledger."""
    budget_month = ledger.budget_months.get((year, month))
    start, end = _month_date_range(year, month)
    planned = _planned_by_category(budget_month)
    actuals = ledger.actuals_between(start, end)
    paydays = ledger.income_paydays(year, month)
    categories = ledger.categories
    as_of = today

    funding = funding_by_expense(budget_month)
    use_by_bucket = planned_use_by_bucket(budget_month)
    deposits, withdrawals = ledger.savings_flows_between(start, end)

    progress: list[CategoryProgress] = []
    for cat in categories:
        p = planned.get(cat.id, ZERO)
        a = actuals.get(cat.id, ZERO)
        if cat.kind in (CategoryKind.income.value, CategoryKind.expense.value):
            a = abs(a)
        remaining = p - a
        if cat.kind == CategoryKind.income.value:
            due = income_shortfall_is_due(
                month_start=start,
                month_end=end,
                today=as_of,
                payday_dates=paydays.get(cat.id, []),
            )
            over_budget = due and a < p and p > ZERO
        else:
            over_budget = a > p and (p > ZERO or a > ZERO)
        fund = funding.get(cat.id) if cat.kind == CategoryKind.expense.value else None
        progress.append(
            CategoryProgress(
                category_id=cat.id,
                category_name=cat.name,
                kind=CategoryKind(cat.kind),
                planned=p,
                actual=a,
                remaining=remaining,
                over_budget=over_budget,
                funded_by_category_id=fund.id if fund else None,
                funded_by_category_name=fund.name if fund else None,
            )
        )
    progress = mark_committed(progress)

    by_kind = {
        CategoryKind.income: [r for r in progress if r.kind == CategoryKind.income],
        CategoryKind.expense: [r for r in progress if r.kind == CategoryKind.expense],
        CategoryKind.savings: [r for r in progress if r.kind == CategoryKind.savings],
    }

    balances = ledger.savings_balances_as_of(end)
    savings_cats = [c for c in categories if c.kind == CategoryKind.savings.value]
    buckets = [
        build_savings_bucket(
            category=c,
            balance=balances.get(c.id, ZERO),
            planned_this_period=planned.get(c.id, ZERO),
            actual_this_period=actuals.get(c.id, ZERO),
            monthly_contribution=planned.get(c.id, ZERO),
            from_year=year,
            from_month=month,
            planned_use_this_period=use_by_bucket.get(c.id, ZERO),
            actual_use_this_period=withdrawals.get(c.id, ZERO),
            actual_contributed_this_period=deposits.get(c.id, ZERO),
        )
        for c in savings_cats
    ]

    if include_pace:
        spending_pace = _assemble_spending_pace(
            as_of=min(as_of, end),
            tracking_started=ledger.first_tracking_date(),
            txs=ledger.transactions,
        )
    else:
        spending_pace = _empty_spending_pace(min(as_of, end))

    income_totals = _kind_totals(by_kind[CategoryKind.income])
    expense_totals = _kind_totals(by_kind[CategoryKind.expense])
    savings_totals = _kind_totals(by_kind[CategoryKind.savings])
    income_short = any(r.over_budget for r in by_kind[CategoryKind.income])
    income_totals = income_totals.model_copy(update={"over_budget": income_short})

    funded_planned = sum(
        (r.planned for r in by_kind[CategoryKind.expense] if r.funded_by_category_id),
        ZERO,
    )
    funded_actual = sum(
        (r.actual for r in by_kind[CategoryKind.expense] if r.funded_by_category_id),
        ZERO,
    )
    leftover_planned = paycheck_leftover(
        income=income_totals.planned,
        expense_from_income=expense_totals.planned - funded_planned,
        savings_contributions=savings_totals.planned,
        expense_from_savings=funded_planned,
    )
    leftover_actual = paycheck_leftover(
        income=income_totals.actual,
        expense_from_income=expense_totals.actual - funded_actual,
        savings_contributions=sum(deposits.values(), ZERO),
        expense_from_savings=funded_actual,
    )
    expense_for_coach = expense_totals.model_copy(
        update={
            "planned": leftover_planned.expense_from_income,
            "actual": leftover_actual.expense_from_income,
            "remaining": leftover_planned.expense_from_income
            - leftover_actual.expense_from_income,
        }
    )
    savings_for_coach = savings_totals.model_copy(
        update={
            "planned": leftover_planned.savings_contributions,
            "actual": leftover_actual.savings_contributions,
            "remaining": leftover_planned.savings_contributions
            - leftover_actual.savings_contributions,
        }
    )
    coach = build_budget_coach(
        year=year,
        month=month,
        income=income_totals,
        expense=expense_for_coach,
        savings=savings_for_coach,
        lines=[
            CoachLine(
                c.category_id,
                c.category_name,
                c.kind,
                c.planned,
                c.actual,
                funded=c.funded_by_category_id is not None,
            )
            for c in progress
        ],
        buckets=buckets,
        pace_overspending=bool(spending_pace.has_data and spending_pace.overspending),
        income_due=income_short,
        today=as_of,
    )

    top_transactions: list = []
    recurring_load: list = []
    runway = None
    flexible = None
    tradeoffs: list = []
    last_month = None
    same_month_last_year = None
    if include_insights:
        top_transactions = build_top_transactions(
            ledger.transactions, start=start, end=end
        )
        recurring_load = build_recurring_load(
            ledger.recurring, progress, year=year, month=month
        )
        runway = build_runway(
            today=as_of,
            year=year,
            month=month,
            expense_planned=expense_totals.planned,
            expense_actual=expense_totals.actual,
        )
        flexible = build_flexible_split(progress, leftover_planned, leftover_actual)
        tradeoffs = build_tradeoffs(
            progress,
            buckets,
            apply_year=year,
            apply_month=month,
        )
        last_month, same_month_last_year = build_period_compare(
            ledger, categories, year=year, month=month
        )

    return MonthlyDashboardOut(
        year=year,
        month=month,
        income=income_totals,
        expense=expense_totals,
        savings=savings_totals,
        leftover_planned=leftover_planned,
        leftover_actual=leftover_actual,
        categories=progress,
        savings_buckets=buckets,
        spending_pace=spending_pace,
        coach=coach,
        top_transactions=top_transactions,
        recurring_load=recurring_load,
        runway=runway,
        flexible_split=flexible,
        tradeoffs=tradeoffs,
        last_month=last_month,
        same_month_last_year=same_month_last_year,
    )


def build_monthly_dashboard(
    db: Session,
    user: User,
    year: int,
    month: int,
    *,
    ensure_month: bool = True,
    include_pace: bool = True,
    today: date | None = None,
) -> MonthlyDashboardOut:
    as_of = today or date.today()
    ledger = load_user_ledger(db, user)
    if ensure_month and (year, month) not in ledger.budget_months:
        _load_budget_month(db, user, year, month, ensure=True)
        ledger = load_user_ledger(db, user)
    return _monthly_from_ledger(
        ledger,
        year,
        month,
        include_pace=include_pace,
        include_insights=True,
        today=as_of,
    )


def build_annual_dashboard(
    db: Session, user: User, year: int, *, today: date | None = None
) -> AnnualDashboardOut:
    """Year view — reads existing months only (does not auto-seed all 12)."""
    months: list[MonthlyTrendPoint] = []
    category_accum: dict[UUID, dict] = {}
    clock = today or date.today()
    leftover_planned = paycheck_leftover(
        income=ZERO, expense_from_income=ZERO, savings_contributions=ZERO
    )
    leftover_actual = paycheck_leftover(
        income=ZERO, expense_from_income=ZERO, savings_contributions=ZERO
    )
    use_by_bucket_year: dict[UUID, Decimal] = {}
    actual_use_year: dict[UUID, Decimal] = {}
    ledger = load_user_ledger(db, user)

    for month in range(1, 13):
        md = _monthly_from_ledger(
            ledger, year, month, include_pace=False, today=clock
        )
        leftover_planned = add_leftovers(leftover_planned, md.leftover_planned)
        leftover_actual = add_leftovers(leftover_actual, md.leftover_actual)
        for b in md.savings_buckets:
            use_by_bucket_year[b.category_id] = (
                use_by_bucket_year.get(b.category_id, ZERO) + b.planned_use_this_period
            )
            actual_use_year[b.category_id] = (
                actual_use_year.get(b.category_id, ZERO) + b.actual_use_this_period
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
                    "funded_planned": ZERO,
                    "samples": [],
                },
            )
            slot["planned"] += row.planned
            slot["actual"] += row.actual
            if row.funded_by_category_id:
                slot["funded_planned"] += row.planned
            over = bool(row.over_budget)
            if over:
                slot["over"] += 1
            elif row.planned > ZERO and row.actual < row.planned:
                slot["under"] += 1
            slot["samples"].append(
                {
                    "month": month,
                    "planned": row.planned,
                    "actual": row.actual,
                    "over": over,
                }
            )

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
    plan_suggestions = build_plan_suggestions(year, category_accum)
    category_health = build_category_health_scores(year, category_accum)

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
    balances = ledger.savings_balances_as_of(year_end)
    savings_cats = [
        c for c in ledger.categories if c.kind == CategoryKind.savings.value
    ]
    # Projection reference: today when browsing the current/future year, else Dec.
    as_of = min(clock, date(year, 12, 31))
    buckets = []
    for c in savings_cats:
        planned_year = ZERO
        actual_year = ZERO
        if c.id in category_accum:
            data = category_accum[c.id]
            planned_year = data["planned"]
            actual_year = data["actual"]
        monthly_rate = ledger.latest_contribution(
            c.id, year=as_of.year, month=as_of.month
        )
        buckets.append(
            build_savings_bucket(
                category=c,
                balance=balances.get(c.id, ZERO),
                planned_this_period=planned_year,
                actual_this_period=actual_year,
                monthly_contribution=monthly_rate,
                from_year=as_of.year,
                from_month=as_of.month,
                planned_use_this_period=use_by_bucket_year.get(c.id, ZERO),
                actual_use_this_period=actual_use_year.get(c.id, ZERO),
            )
        )

    spending_pace = _assemble_spending_pace(
        as_of=as_of,
        tracking_started=ledger.first_tracking_date(),
        txs=ledger.transactions,
    )

    plan_month_count = max(
        sum(
            1
            for m in months
            if m.income_planned + m.expense_planned + m.savings_planned > ZERO
        ),
        1,
    )
    income_totals = sum_kind("income_planned", "income_actual")
    expense_totals = sum_kind("expense_planned", "expense_actual")
    savings_totals = sum_kind("savings_planned", "savings_actual")
    income_totals = income_totals.model_copy(
        update={
            "over_budget": any(
                t.kind == CategoryKind.income and t.months_over_budget > 0
                for t in trends
            )
        }
    )
    under_planned_ids = {
        h.category_id for h in category_health if h.status == "under_planned"
    }
    coach_lines = [
        CoachLine(
            t.category_id,
            t.category_name,
            t.kind,
            _money(t.total_planned / Decimal(plan_month_count)),
            funded=(
                category_accum.get(t.category_id, {}).get("funded_planned", ZERO)
                >= t.total_planned
                and t.total_planned > ZERO
            ),
        )
        for t in trends
    ]
    expense_for_coach = expense_totals.model_copy(
        update={
            "planned": leftover_planned.expense_from_income,
            "actual": leftover_actual.expense_from_income,
            "remaining": leftover_planned.expense_from_income
            - leftover_actual.expense_from_income,
        }
    )
    savings_for_coach = savings_totals.model_copy(
        update={
            "planned": leftover_planned.savings_contributions,
            "actual": leftover_actual.savings_contributions,
            "remaining": leftover_planned.savings_contributions
            - leftover_actual.savings_contributions,
        }
    )
    coach = build_budget_coach(
        year=year,
        month=None,
        income=income_totals,
        expense=expense_for_coach,
        savings=savings_for_coach,
        lines=coach_lines,
        buckets=buckets,
        pace_overspending=bool(spending_pace.has_data and spending_pace.overspending),
        plan_suggestions=plan_suggestions,
        under_planned_ids=under_planned_ids,
        plan_month_count=plan_month_count,
        today=clock,
    )

    return AnnualDashboardOut(
        year=year,
        months=months,
        category_trends=trends,
        plan_suggestions=plan_suggestions,
        category_health=category_health,
        income=income_totals,
        expense=expense_totals,
        savings=savings_totals,
        leftover_planned=leftover_planned,
        leftover_actual=leftover_actual,
        savings_buckets=buckets,
        spending_pace=spending_pace,
        coach=coach,
        top_transactions=build_top_transactions(
            ledger.transactions,
            start=date(year, 1, 1),
            end=date(year, 12, 31),
        ),
        flexible_split=build_flexible_split(
            mark_committed(
                [
                    CategoryProgress(
                        category_id=t.category_id,
                        category_name=t.category_name,
                        kind=t.kind,
                        planned=t.total_planned,
                        actual=t.total_actual,
                        remaining=t.total_planned - t.total_actual,
                        over_budget=t.months_over_budget > 0,
                    )
                    for t in trends
                ]
            ),
            leftover_planned,
            leftover_actual,
        ),
        tradeoffs=build_tradeoffs(
            mark_committed(
                [
                    CategoryProgress(
                        category_id=t.category_id,
                        category_name=t.category_name,
                        kind=t.kind,
                        planned=_money(t.total_planned / Decimal(plan_month_count)),
                        actual=_money(t.total_actual / Decimal(plan_month_count)),
                        remaining=_money(
                            (t.total_planned - t.total_actual)
                            / Decimal(plan_month_count)
                        ),
                        over_budget=t.months_over_budget > 0,
                    )
                    for t in trends
                ]
            ),
            buckets,
            apply_year=coach.apply_year,
            apply_month=coach.apply_month,
        ),
        category_month_cells=build_category_month_cells(category_accum),
        savings_history=build_savings_history(ledger, buckets, year=year),
        prior_year=build_prior_year_totals(
            ledger, ledger.categories, year=year
        ),
    )
