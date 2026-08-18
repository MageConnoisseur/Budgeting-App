"""Deterministic budget coach: leftover allocation, shortfall, savings goals.

Advice is optional and soft — never blocks logging. Dollar amounts come from the
user's own plan, actuals, and savings targets (not an LLM).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from uuid import UUID

from app.enums import CategoryKind
from app.schemas import (
    BudgetCoachOut,
    CoachTip,
    KindTotals,
    PlanSuggestion,
    SavingsBucketOut,
)

CoachTipKind = Literal[
    "get_started",
    "allocate_surplus",
    "close_shortfall",
    "fund_savings",
    "raise_plan",
    "seasonal",
    "pace_warning",
    "balanced",
    "income_short",
]

ZERO = Decimal("0.00")
MONEY = Decimal("0.01")
# Ignore leftover noise under a dollar.
MIN_MOVE = Decimal("1.00")
MAX_TIPS = 6
# Housing / debt / insurance — usually not the line to trim first.
_FIXED_NAME_RE = re.compile(
    r"\b(rent|mortgage|housing|lease|hoa|home\s*loan|"
    r"car\s*payment|auto\s*loan|car\s*loan|vehicle|"
    r"student\s*loan|tuition|daycare|child\s*care|childcare|"
    r"health\s*insurance|car\s*insurance|auto\s*insurance|"
    r"life\s*insurance|renters?\s*insurance|homeowners?|"
    r"condo\s*fee|parking|apartment)\b",
    re.I,
)
_DISCRETIONARY_NAME_RE = re.compile(
    r"(dining|restaurant|eating\s*out|takeout|take-out|coffee|"
    r"entertainment|shopping|clothes|clothing|hobb(?:y|ies)|"
    r"subscription|streaming|travel|gifts?|alcohol|"
    r"\bbars?\b|games?|personal\s*care|beauty|"
    r"fast\s*food|delivery|going\s*out|nightlife|"
    r"concerts?|movies?|\bfun\b)",
    re.I,
)
# If one unnamed expense is this share of planned spend and something else
# exists, treat it as likely fixed (custom-named housing).
_DOMINANT_SHARE = Decimal("0.50")
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


@dataclass(frozen=True)
class CoachLine:
    category_id: UUID
    category_name: str
    kind: CategoryKind
    planned: Decimal
    actual: Decimal = ZERO
    funded: bool = False


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def _usd(value: Decimal) -> str:
    return f"${_money(value)}"


def _leftover(income: KindTotals, expense: KindTotals, savings: KindTotals, basis: str) -> Decimal:
    if basis == "planned":
        return _money(income.planned - expense.planned - savings.planned)
    return _money(income.actual - expense.actual - savings.actual)


def _apply_target(
    year: int,
    month: int | None,
    *,
    today: date,
) -> tuple[int, int]:
    if month is not None:
        return year, month
    if year == today.year:
        return year, today.month
    return year, 12


def _scope_phrase(month: int | None) -> str:
    return "this month" if month is not None else "this year"


def _pick_savings_destination(
    buckets: list[SavingsBucketOut],
) -> SavingsBucketOut | None:
    if not buckets:
        return None
    open_targets = [
        b
        for b in buckets
        if b.target_amount is not None
        and not b.target_reached
        and b.target_amount > (b.balance or ZERO)
    ]
    if open_targets:

        def remaining(b: SavingsBucketOut) -> Decimal:
            assert b.target_amount is not None
            return b.target_amount - b.balance

        open_targets.sort(
            key=lambda b: (
                0 if b.monthly_contribution <= ZERO else 1,
                -remaining(b),
                b.category_name,
            )
        )
        return open_targets[0]
    return sorted(buckets, key=lambda b: b.category_name)[0]


def _current_savings_plan(
    bucket: SavingsBucketOut,
    lines: list[CoachLine],
    *,
    month: int | None,
) -> Decimal:
    if month is not None:
        match = next((l for l in lines if l.category_id == bucket.category_id), None)
        if match is not None:
            return _money(match.planned)
        return _money(bucket.planned_this_period)
    return _money(bucket.monthly_contribution)


def _getting_started_tips(
    lines: list[CoachLine],
    income: KindTotals,
    month: int | None,
) -> list[CoachTip]:
    scope = _scope_phrase(month)
    has_income_cat = any(l.kind == CategoryKind.income for l in lines)
    if not lines:
        return [
            CoachTip(
                id="get-started",
                kind="get_started",
                title="Set up categories first",
                message=(
                    "Add income, expense, and savings categories, then plan "
                    f"{scope} on Budget. The coach uses those numbers — it "
                    "does not invent a generic split."
                ),
                priority=0,
                cta_href="/categories",
                cta_label="Add categories",
            )
        ]
    if not has_income_cat or income.planned <= ZERO:
        return [
            CoachTip(
                id="get-started",
                kind="get_started",
                title="Plan income first",
                message=(
                    f"Start {scope} by planning income, then give every dollar "
                    "a job as expenses or savings contributions. Next months "
                    "copy forward from this plan."
                ),
                priority=0,
                cta_href="/budget",
                cta_label="Open Budget",
            )
        ]
    return []


def _is_named_fixed(name: str) -> bool:
    return bool(_FIXED_NAME_RE.search(name))


def _is_discretionary(name: str) -> bool:
    return bool(_DISCRETIONARY_NAME_RE.search(name))


def _pick_shortfall_line(
    lines: list[CoachLine],
    *,
    under_planned_ids: set[UUID],
    gap: Decimal,
) -> CoachLine | None:
    """Prefer flexible spend over rent/mortgage-sized fixed costs."""
    expenses = [
        l
        for l in lines
        if l.kind == CategoryKind.expense
        and l.planned >= MIN_MOVE
        and l.category_id not in under_planned_ids
        and not l.funded
    ]
    if not expenses:
        return None
    total = sum((l.planned for l in expenses), ZERO)

    def is_dominant(line: CoachLine) -> bool:
        if _is_discretionary(line.category_name):
            return False
        return (
            len(expenses) >= 2
            and total > ZERO
            and line.planned >= total * _DOMINANT_SHARE
        )

    flexible = [
        l
        for l in expenses
        if not _is_named_fixed(l.category_name) and not is_dominant(l)
    ]
    if not flexible:
        return None

    discretionary = [l for l in flexible if _is_discretionary(l.category_name)]
    ranked = discretionary if discretionary else flexible
    absorb = [l for l in ranked if l.planned - gap >= MIN_MOVE]
    pool = absorb if absorb else ranked
    pool.sort(key=lambda l: (-l.planned, l.category_name))
    return pool[0]


def _shortfall_tip(
    lines: list[CoachLine],
    *,
    month: int | None,
    apply_year: int,
    apply_month: int,
    under_planned_ids: set[UUID],
    total: Decimal,
    amount: Decimal,
) -> CoachTip:
    scope = _scope_phrase(month)
    gap_total = _money(abs(total))
    gap = _money(abs(amount))
    line = _pick_shortfall_line(
        lines, under_planned_ids=under_planned_ids, gap=gap
    )
    apply_when = f"{_MONTH_NAMES[apply_month - 1]} {apply_year}"
    year_note = (
        f" About {_usd(gap)} of that is a typical month’s share."
        if month is None and gap != gap_total
        else ""
    )

    if line is None:
        return CoachTip(
            id="close-shortfall",
            kind="close_shortfall",
            title="This plan spends more than income",
            message=(
                f"{_usd(gap_total)} more is planned than income for {scope}."
                f"{year_note} "
                "Rent, mortgage, and other large fixed lines are left alone. "
                "Raise income or trim flexible spend (dining, shopping, …) "
                "on Budget. Soft advice only — you can keep a shortfall if "
                "that is intentional."
            ),
            priority=1,
            amount=gap,
            cta_href="/budget",
            cta_label="Edit Budget",
        )

    suggested = _money(line.planned - gap)
    can_apply = suggested >= MIN_MOVE
    if can_apply:
        message = (
            f"{_usd(gap_total)} more is planned than income for {scope}."
            f"{year_note} "
            f"{line.category_name} looks more flexible than housing or loan "
            f"payments. Trimming it to {_usd(suggested)} for {apply_when} "
            "would close this month’s share."
        )
    else:
        message = (
            f"{_usd(gap_total)} more is planned than income for {scope}."
            f"{year_note} "
            f"{line.category_name} is a flexible expense "
            f"({_usd(line.planned)}), but trimming it would not cover the "
            "gap — raise income or spread cuts across a few lines on Budget."
        )
    return CoachTip(
        id=f"close-shortfall:{line.category_id}",
        kind="close_shortfall",
        title="This plan spends more than income",
        message=message,
        priority=1,
        category_id=line.category_id,
        category_name=line.category_name,
        apply_year=apply_year if can_apply else None,
        apply_month=apply_month if can_apply else None,
        current_planned=line.planned if can_apply else None,
        suggested_planned=suggested if can_apply else None,
        amount=gap,
        apply_label=f"Trim {line.category_name} by {_usd(gap)}" if can_apply else None,
        cta_href=None if can_apply else "/budget",
        cta_label=None if can_apply else "Edit Budget",
    )


def _surplus_tip(
    buckets: list[SavingsBucketOut],
    lines: list[CoachLine],
    *,
    month: int | None,
    apply_year: int,
    apply_month: int,
    total: Decimal,
    amount: Decimal,
) -> CoachTip:
    scope = _scope_phrase(month)
    extra = _money(amount)
    extra_total = _money(total)
    dest = _pick_savings_destination(buckets)
    apply_when = f"{_MONTH_NAMES[apply_month - 1]} {apply_year}"
    year_note = (
        f" A typical month’s share is {_usd(extra)}."
        if month is None and extra != extra_total
        else ""
    )

    if dest is None:
        return CoachTip(
            id="allocate-surplus",
            kind="allocate_surplus",
            title="Unassigned leftover",
            message=(
                f"{_usd(extra_total)} of planned income for {scope} is not assigned "
                f"to expenses or savings.{year_note} Add a savings bucket (Emergency, "
                "Vacation, …) or raise a spending plan so every dollar has a job."
            ),
            priority=2,
            amount=extra,
            cta_href="/categories",
            cta_label="Add a savings bucket",
        )

    current = _current_savings_plan(dest, lines, month=month)
    suggested = _money(current + extra)
    remaining = None
    if dest.target_amount is not None and not dest.target_reached:
        remaining = _money(dest.target_amount - dest.balance)
    if remaining is not None and remaining > ZERO:
        message = (
            f"{_usd(extra_total)} is still unassigned for {scope}.{year_note} "
            f"{dest.category_name} is {_usd(remaining)} from its target "
            f"({_usd(dest.target_amount)}). Adding the leftover to the "
            f"{apply_when} contribution (→ {_usd(suggested)}) is a concrete next step."
        )
        title = f"Put leftover toward {dest.category_name}"
        tip_kind: CoachTipKind = "fund_savings"
    else:
        message = (
            f"{_usd(extra_total)} is still unassigned for {scope}.{year_note} "
            f"Adding {_usd(extra)} to {dest.category_name} for {apply_when} "
            f"(→ {_usd(suggested)}) keeps the leftover in a named bucket."
        )
        title = f"Assign leftover to {dest.category_name}"
        tip_kind = "allocate_surplus"

    return CoachTip(
        id=f"{tip_kind}:{dest.category_id}",
        kind=tip_kind,
        title=title,
        message=message,
        priority=2,
        category_id=dest.category_id,
        category_name=dest.category_name,
        apply_year=apply_year,
        apply_month=apply_month,
        current_planned=current,
        suggested_planned=suggested,
        amount=extra,
        apply_label=f"Add {_usd(extra)} to {dest.category_name}",
    )


def _income_short_tip(
    lines: list[CoachLine],
    income: KindTotals,
    *,
    month: int | None,
) -> CoachTip | None:
    """Only used when paydays (or the month) are already due."""
    if month is None:
        return None
    gap = _money(income.planned - income.actual)
    if gap < MIN_MOVE:
        return None
    shorts = [
        l
        for l in lines
        if l.kind == CategoryKind.income
        and l.planned >= MIN_MOVE
        and l.planned - l.actual >= MIN_MOVE
    ]
    if not shorts:
        return None
    shorts.sort(key=lambda l: (-(l.planned - l.actual), l.category_name))
    line = shorts[0]
    missed = _money(line.planned - line.actual)
    return CoachTip(
        id=f"income-short:{line.category_id}",
        kind="income_short",
        title=f"{line.category_name} is short of the plan",
        message=(
            f"{_usd(missed)} of planned {line.category_name} for this month "
            "never showed up after the payday (or month) was due. Log the "
            "deposit in Tracker if it arrived, or lower the income plan if "
            "pay changed. Future months are not flagged until they are due."
        ),
        priority=1,
        category_id=line.category_id,
        category_name=line.category_name,
        amount=missed,
        cta_href="/tracker",
        cta_label="Log income",
    )


def _plan_suggestion_tips(suggestions: list[PlanSuggestion]) -> list[CoachTip]:
    tips: list[CoachTip] = []
    raises = [s for s in suggestions if s.suggestion_kind == "median_raise"]
    seasonals = [s for s in suggestions if s.suggestion_kind == "seasonal"]
    for s in raises[:2]:
        can_apply = (
            s.apply_year is not None
            and s.apply_month is not None
            and s.suggested_planned is not None
        )
        delta = s.median_overrun
        apply_label = (
            f"Raise {s.category_name} by {_usd(delta)}" if delta is not None else None
        )
        tips.append(
            CoachTip(
                id=f"raise-plan:{s.category_id}",
                kind="raise_plan",
                title=f"{s.category_name} is often under-planned",
                message=s.message,
                priority=3,
                category_id=s.category_id,
                category_name=s.category_name,
                apply_year=s.apply_year if can_apply else None,
                apply_month=s.apply_month if can_apply else None,
                current_planned=s.current_planned if can_apply else None,
                suggested_planned=s.suggested_planned if can_apply else None,
                amount=delta,
                apply_label=apply_label if can_apply else None,
            )
        )
    for s in seasonals[:1]:
        tips.append(
            CoachTip(
                id=f"seasonal:{s.category_id}",
                kind="seasonal",
                title=f"{s.category_name} looks seasonal",
                message=s.message,
                priority=4,
                category_id=s.category_id,
                category_name=s.category_name,
            )
        )
    return tips


def _headline(
    tone: str,
    leftover_planned: Decimal,
    *,
    month: int | None,
    pace_hot: bool,
) -> str:
    scope = _scope_phrase(month)
    if tone == "getting_started":
        return f"Plan {scope}'s income first"
    if tone == "shortfall":
        return f"{_usd(abs(leftover_planned))} more planned than income"
    if tone == "surplus":
        return f"{_usd(leftover_planned)} still unassigned"
    if pace_hot:
        return "Plan is balanced — spending pace is running hot"
    return f"This {('month' if month is not None else 'year')}'s plan is balanced"


def build_budget_coach(
    *,
    year: int,
    month: int | None,
    income: KindTotals,
    expense: KindTotals,
    savings: KindTotals,
    lines: list[CoachLine],
    buckets: list[SavingsBucketOut],
    pace_overspending: bool = False,
    plan_suggestions: list[PlanSuggestion] | None = None,
    under_planned_ids: set[UUID] | None = None,
    plan_month_count: int = 1,
    income_due: bool = False,
    today: date | None = None,
) -> BudgetCoachOut:
    """Build a short, ordered list of optional coaching tips."""
    as_of = today or date.today()
    under = under_planned_ids or set()
    divisor = max(plan_month_count, 1)
    leftover_planned = _leftover(income, expense, savings, "planned")
    leftover_actual = _leftover(income, expense, savings, "actual")
    # On a year view, apply a typical month's share rather than the year total.
    period_leftover = leftover_planned
    if month is None:
        period_leftover = _money(leftover_planned / Decimal(divisor))

    apply_year, apply_month = _apply_target(year, month, today=as_of)
    tips: list[CoachTip] = []

    started = _getting_started_tips(lines, income, month)
    tips.extend(started)

    if not started:
        if leftover_planned <= -MIN_MOVE:
            tips.append(
                _shortfall_tip(
                    lines,
                    month=month,
                    apply_year=apply_year,
                    apply_month=apply_month,
                    under_planned_ids=under,
                    total=leftover_planned,
                    amount=period_leftover,
                )
            )
        elif leftover_planned >= MIN_MOVE:
            tips.append(
                _surplus_tip(
                    buckets,
                    lines,
                    month=month,
                    apply_year=apply_year,
                    apply_month=apply_month,
                    total=leftover_planned,
                    amount=period_leftover,
                )
            )
        if income_due:
            missed = _income_short_tip(lines, income, month=month)
            if missed is not None:
                tips.append(missed)

    if plan_suggestions:
        funded_ids = {t.category_id for t in tips if t.category_id}
        extra = [
            t
            for t in _plan_suggestion_tips(plan_suggestions)
            if t.category_id not in funded_ids
        ]
        tips.extend(extra)

    if pace_overspending:
        tips.append(
            CoachTip(
                id="pace-warning",
                kind="pace_warning",
                title="Spending pace is ahead of income",
                message=(
                    "Outflows over the last ~30 days are running ahead of your "
                    "average daily income. Soft signal only — it does not block "
                    "logging. Slow spending or log upcoming income if it is missing."
                ),
                priority=5,
            )
        )

    if not tips:
        tips.append(
            CoachTip(
                id="balanced",
                kind="balanced",
                title="Every planned dollar has a job",
                message=(
                    f"Income covers expenses and savings for {_scope_phrase(month)}. "
                    "Watch actual leftover and spending pace as you log transactions, "
                    "and raise plans where you repeatedly overrun."
                ),
                priority=7,
            )
        )

    tips.sort(key=lambda t: (t.priority, t.title))
    tips = tips[:MAX_TIPS]

    if any(t.kind == "get_started" for t in tips):
        tone = "getting_started"
    elif leftover_planned <= -MIN_MOVE:
        tone = "shortfall"
    elif leftover_planned >= MIN_MOVE:
        tone = "surplus"
    elif pace_overspending:
        tone = "watch"
    else:
        tone = "balanced"

    return BudgetCoachOut(
        headline=_headline(
            tone, leftover_planned, month=month, pace_hot=pace_overspending
        ),
        tone=tone,  # type: ignore[arg-type]
        leftover_planned=leftover_planned,
        leftover_actual=leftover_actual,
        apply_year=apply_year,
        apply_month=apply_month,
        tips=tips,
    )
