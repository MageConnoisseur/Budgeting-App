"""Spending pace is an even split of the expense budget, not average income."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.services.dashboard import _assemble_spending_pace, _month_date_range


def _tx(kind: str, amount: str, when: date) -> SimpleNamespace:
    return SimpleNamespace(
        date=when,
        amount=Decimal(amount),
        category=SimpleNamespace(kind=kind),
    )


def test_month_pace_stops_at_today_and_ignores_savings() -> None:
    start, end = _month_date_range(2026, 10)
    pace = _assemble_spending_pace(
        period_start=start,
        period_end=end,
        today=date(2026, 10, 5),
        budget_segments=[(start, end, Decimal("3100.00"))],
        txs=[
            _tx("income", "4000.00", date(2026, 10, 1)),
            _tx("expense", "250.00", date(2026, 10, 1)),
            _tx("savings", "800.00", date(2026, 10, 2)),
            _tx("expense", "250.00", date(2026, 10, 5)),
            _tx("expense", "999.00", date(2026, 10, 20)),
            _tx("expense", "-20.00", date(2026, 10, 4)),
        ],
    )
    assert pace.period_days == 31
    assert pace.days_elapsed == 5
    assert pace.days_left == 26
    assert pace.expense_planned == Decimal("3100.00")
    # 250 + 250 - 20. The Oct 20 charge is still in the future. Savings and
    # income do not count.
    assert pace.expense_spent == Decimal("480.00")
    assert pace.budget_to_date == Decimal("500.00")
    assert pace.overspending is False
    assert len(pace.days) == 31
    assert pace.days[4].date == date(2026, 10, 5)
    assert pace.days[4].cumulative_spent == Decimal("480.00")
    assert pace.days[4].cumulative_budget == Decimal("500.00")
    assert pace.days[5].cumulative_spent is None
    assert pace.days[-1].cumulative_spent is None
    assert pace.days[-1].cumulative_budget == Decimal("3100.00")


def test_month_pace_flags_spending_ahead_of_even_budget() -> None:
    start, end = _month_date_range(2026, 10)
    pace = _assemble_spending_pace(
        period_start=start,
        period_end=end,
        today=date(2026, 10, 5),
        budget_segments=[(start, end, Decimal("3100.00"))],
        txs=[_tx("expense", "800.00", date(2026, 10, 1))],
    )
    assert pace.budget_to_date == Decimal("500.00")
    assert pace.expense_spent == Decimal("800.00")
    assert pace.overspending is True


def test_finished_month_compares_spent_with_the_full_plan() -> None:
    start, end = _month_date_range(2026, 5)
    pace = _assemble_spending_pace(
        period_start=start,
        period_end=end,
        today=date(2026, 10, 5),
        budget_segments=[(start, end, Decimal("300.00"))],
        txs=[
            _tx("expense", "200.00", date(2026, 5, 16)),
            _tx("expense", "4000.00", date(2026, 5, 28)),
            _tx("savings", "500.00", date(2026, 5, 18)),
        ],
    )
    assert pace.days_elapsed == 31
    assert pace.days_left == 0
    assert pace.expense_spent == Decimal("4200.00")
    assert pace.budget_to_date == Decimal("300.00")
    assert pace.overspending is True
    assert pace.days[-1].cumulative_spent == Decimal("4200.00")


def test_year_pace_spreads_each_month_on_its_own_plan() -> None:
    jan_start, jan_end = _month_date_range(2026, 1)
    feb_start, feb_end = _month_date_range(2026, 2)
    segments = [
        (jan_start, jan_end, Decimal("3100.00")),
        (feb_start, feb_end, Decimal("2800.00")),
    ]
    for month in range(3, 13):
        segments.append((*_month_date_range(2026, month), Decimal("0.00")))
    pace = _assemble_spending_pace(
        period_start=date(2026, 1, 1),
        period_end=date(2026, 12, 31),
        today=date(2026, 2, 10),
        budget_segments=segments,
        txs=[
            _tx("expense", "3100.00", date(2026, 1, 15)),
            _tx("expense", "200.00", date(2026, 2, 3)),
        ],
    )
    # January in full, plus 10/28 of February's $2,800.
    assert pace.budget_to_date == Decimal("4100.00")
    assert pace.expense_spent == Decimal("3300.00")
    assert pace.expense_planned == Decimal("5900.00")
    assert pace.overspending is False
    feb_10 = next(d for d in pace.days if d.date == date(2026, 2, 10))
    assert feb_10.cumulative_spent == Decimal("3300.00")
    assert feb_10.cumulative_budget == Decimal("4100.00")
    assert pace.days[-1].cumulative_budget == Decimal("5900.00")
    assert pace.days[-1].cumulative_spent is None


def test_future_month_has_a_budget_line_and_no_spend_yet() -> None:
    start, end = _month_date_range(2026, 12)
    pace = _assemble_spending_pace(
        period_start=start,
        period_end=end,
        today=date(2026, 10, 5),
        budget_segments=[(start, end, Decimal("900.00"))],
        txs=[_tx("expense", "40.00", date(2026, 12, 2))],
    )
    assert pace.days_elapsed == 0
    assert pace.expense_spent == Decimal("0.00")
    assert pace.budget_to_date == Decimal("0.00")
    assert pace.overspending is False
    assert pace.has_data is True
    assert all(d.cumulative_spent is None for d in pace.days)
    assert pace.days[-1].cumulative_budget == Decimal("900.00")
