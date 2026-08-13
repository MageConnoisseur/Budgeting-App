"""Unit tests for the deterministic budget coach."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.enums import CategoryKind
from app.schemas import KindTotals, PlanSuggestion, SavingsBucketOut
from app.services.coach import CoachLine, build_budget_coach

ZERO = Decimal("0.00")


def _totals(planned: str, actual: str = "0.00") -> KindTotals:
    p = Decimal(planned)
    a = Decimal(actual)
    return KindTotals(
        planned=p,
        actual=a,
        remaining=p - a,
        over_budget=a > p and p > ZERO,
    )


def _line(name: str, kind: CategoryKind, planned: str, cid=None) -> CoachLine:
    return CoachLine(
        category_id=cid or uuid4(),
        category_name=name,
        kind=kind,
        planned=Decimal(planned),
    )


def _bucket(
    name: str,
    *,
    planned: str = "0.00",
    balance: str = "0.00",
    target: str | None = None,
    monthly: str | None = None,
    cid=None,
) -> SavingsBucketOut:
    target_amt = Decimal(target) if target is not None else None
    bal = Decimal(balance)
    return SavingsBucketOut(
        category_id=cid or uuid4(),
        category_name=name,
        balance=bal,
        planned_this_period=Decimal(planned),
        actual_this_period=ZERO,
        over_budget=False,
        target_amount=target_amt,
        target_reached=bool(target_amt is not None and bal >= target_amt),
        projected_hit_year=None,
        projected_hit_month=None,
        monthly_contribution=Decimal(monthly if monthly is not None else planned),
    )


def test_empty_plan_is_getting_started() -> None:
    coach = build_budget_coach(
        year=2026,
        month=8,
        income=_totals("0.00"),
        expense=_totals("0.00"),
        savings=_totals("0.00"),
        lines=[],
        buckets=[],
        today=date(2026, 8, 13),
    )
    assert coach.tone == "getting_started"
    assert coach.tips[0].kind == "get_started"
    assert coach.tips[0].cta_href == "/categories"
    assert coach.apply_month == 8


def test_income_without_assignment_is_getting_started() -> None:
    income_id = uuid4()
    coach = build_budget_coach(
        year=2026,
        month=8,
        income=_totals("0.00"),
        expense=_totals("0.00"),
        savings=_totals("0.00"),
        lines=[_line("Paycheck", CategoryKind.income, "0.00", income_id)],
        buckets=[],
        today=date(2026, 8, 13),
    )
    assert coach.tone == "getting_started"
    assert coach.tips[0].cta_href == "/budget"


def test_surplus_funds_savings_target() -> None:
    emergency = uuid4()
    groceries = uuid4()
    coach = build_budget_coach(
        year=2026,
        month=8,
        income=_totals("4000.00"),
        expense=_totals("3000.00"),
        savings=_totals("200.00"),
        lines=[
            _line("Paycheck", CategoryKind.income, "4000.00"),
            _line("Groceries", CategoryKind.expense, "3000.00", groceries),
            _line("Emergency", CategoryKind.savings, "200.00", emergency),
        ],
        buckets=[
            _bucket(
                "Emergency",
                planned="200.00",
                balance="400.00",
                target="2000.00",
                cid=emergency,
            )
        ],
        today=date(2026, 8, 13),
    )
    assert coach.tone == "surplus"
    assert coach.leftover_planned == Decimal("800.00")
    tip = next(t for t in coach.tips if t.kind == "fund_savings")
    assert tip.category_id == emergency
    assert tip.current_planned == Decimal("200.00")
    assert tip.suggested_planned == Decimal("1000.00")
    assert tip.apply_year == 2026
    assert tip.apply_month == 8
    assert "Add $800.00" in (tip.apply_label or "")


def test_surplus_without_buckets_points_to_categories() -> None:
    coach = build_budget_coach(
        year=2026,
        month=8,
        income=_totals("4000.00"),
        expense=_totals("3500.00"),
        savings=_totals("0.00"),
        lines=[
            _line("Paycheck", CategoryKind.income, "4000.00"),
            _line("Rent", CategoryKind.expense, "3500.00"),
        ],
        buckets=[],
        today=date(2026, 8, 13),
    )
    tip = coach.tips[0]
    assert tip.kind == "allocate_surplus"
    assert tip.cta_href == "/categories"
    assert tip.suggested_planned is None


def test_shortfall_offers_trim_on_largest_expense() -> None:
    rent = uuid4()
    dining = uuid4()
    coach = build_budget_coach(
        year=2026,
        month=8,
        income=_totals("3000.00"),
        expense=_totals("3400.00"),
        savings=_totals("100.00"),
        lines=[
            _line("Paycheck", CategoryKind.income, "3000.00"),
            _line("Rent", CategoryKind.expense, "2000.00", rent),
            _line("Dining", CategoryKind.expense, "1400.00", dining),
            _line("Emergency", CategoryKind.savings, "100.00"),
        ],
        buckets=[_bucket("Emergency", planned="100.00")],
        today=date(2026, 8, 13),
    )
    assert coach.tone == "shortfall"
    assert coach.leftover_planned == Decimal("-500.00")
    tip = next(t for t in coach.tips if t.kind == "close_shortfall")
    assert tip.category_id == rent
    assert tip.current_planned == Decimal("2000.00")
    assert tip.suggested_planned == Decimal("1500.00")


def test_shortfall_skips_under_planned_expense() -> None:
    groceries = uuid4()
    dining = uuid4()
    coach = build_budget_coach(
        year=2026,
        month=8,
        income=_totals("3000.00"),
        expense=_totals("3300.00"),
        savings=_totals("0.00"),
        lines=[
            _line("Paycheck", CategoryKind.income, "3000.00"),
            _line("Groceries", CategoryKind.expense, "2000.00", groceries),
            _line("Dining", CategoryKind.expense, "1300.00", dining),
        ],
        buckets=[],
        under_planned_ids={groceries},
        today=date(2026, 8, 13),
    )
    tip = next(t for t in coach.tips if t.kind == "close_shortfall")
    assert tip.category_id == dining
    assert tip.suggested_planned == Decimal("1000.00")


def test_balanced_plan_with_pace_warning() -> None:
    coach = build_budget_coach(
        year=2026,
        month=8,
        income=_totals("3000.00", "1500.00"),
        expense=_totals("2500.00", "1800.00"),
        savings=_totals("500.00", "200.00"),
        lines=[
            _line("Paycheck", CategoryKind.income, "3000.00"),
            _line("Rent", CategoryKind.expense, "2500.00"),
            _line("Emergency", CategoryKind.savings, "500.00"),
        ],
        buckets=[_bucket("Emergency", planned="500.00")],
        pace_overspending=True,
        today=date(2026, 8, 13),
    )
    assert coach.tone == "watch"
    assert any(t.kind == "pace_warning" for t in coach.tips)
    assert any(t.kind == "balanced" for t in coach.tips) is False
    # leftover is 0, so surplus/shortfall tips stay off
    assert not any(t.kind in ("allocate_surplus", "close_shortfall") for t in coach.tips)


def test_balanced_without_other_signals() -> None:
    coach = build_budget_coach(
        year=2026,
        month=8,
        income=_totals("3000.00"),
        expense=_totals("2500.00"),
        savings=_totals("500.00"),
        lines=[
            _line("Paycheck", CategoryKind.income, "3000.00"),
            _line("Rent", CategoryKind.expense, "2500.00"),
            _line("Emergency", CategoryKind.savings, "500.00"),
        ],
        buckets=[_bucket("Emergency", planned="500.00")],
        today=date(2026, 8, 13),
    )
    assert coach.tone == "balanced"
    assert coach.tips[0].kind == "balanced"


def test_annual_surplus_uses_monthly_share() -> None:
    emergency = uuid4()
    coach = build_budget_coach(
        year=2026,
        month=None,
        income=_totals("12000.00"),
        expense=_totals("9000.00"),
        savings=_totals("600.00"),
        lines=[
            _line("Paycheck", CategoryKind.income, "4000.00"),
            _line("Rent", CategoryKind.expense, "3000.00"),
            _line("Emergency", CategoryKind.savings, "200.00", emergency),
        ],
        buckets=[
            _bucket(
                "Emergency",
                planned="600.00",
                monthly="200.00",
                balance="100.00",
                target="1000.00",
                cid=emergency,
            )
        ],
        plan_month_count=3,
        today=date(2026, 8, 13),
    )
    # Year leftover 2400 / 3 months = 800 applied to current month contribution.
    assert coach.leftover_planned == Decimal("2400.00")
    tip = next(t for t in coach.tips if t.kind == "fund_savings")
    assert tip.amount == Decimal("800.00")
    assert tip.current_planned == Decimal("200.00")
    assert tip.suggested_planned == Decimal("1000.00")
    assert tip.apply_month == 8


def test_includes_plan_raise_suggestions() -> None:
    dining = uuid4()
    emergency = uuid4()
    suggestions = [
        PlanSuggestion(
            category_id=dining,
            category_name="Dining",
            kind=CategoryKind.expense,
            suggestion_kind="median_raise",
            months_over=4,
            median_overrun=Decimal("40.00"),
            apply_year=2026,
            apply_month=8,
            current_planned=Decimal("200.00"),
            suggested_planned=Decimal("240.00"),
            message="Raise plan by $40.00 (median overrun over 4 months).",
        )
    ]
    coach = build_budget_coach(
        year=2026,
        month=None,
        income=_totals("36000.00"),
        expense=_totals("30000.00"),
        savings=_totals("6000.00"),
        lines=[
            _line("Paycheck", CategoryKind.income, "3000.00"),
            _line("Dining", CategoryKind.expense, "200.00", dining),
            _line("Emergency", CategoryKind.savings, "500.00", emergency),
        ],
        buckets=[_bucket("Emergency", planned="500.00", monthly="500.00", cid=emergency)],
        plan_suggestions=suggestions,
        today=date(2026, 8, 13),
    )
    assert coach.tone == "balanced"
    raise_tip = next(t for t in coach.tips if t.kind == "raise_plan")
    assert raise_tip.category_id == dining
    assert raise_tip.suggested_planned == Decimal("240.00")
    assert raise_tip.apply_label is not None
