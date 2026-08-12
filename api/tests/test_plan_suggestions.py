"""Unit tests for soft plan-raise coaching suggestions."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.enums import CategoryKind
from app.services.dashboard import (
    _median_money,
    build_plan_suggestions,
)

ZERO = Decimal("0.00")


def _sample(month: int, planned: str, actual: str, *, over: bool | None = None) -> dict:
    p = Decimal(planned)
    a = Decimal(actual)
    is_over = over if over is not None else (a > p and p > ZERO)
    return {"month": month, "planned": p, "actual": a, "over": is_over}


def test_median_money_odd_and_even() -> None:
    assert _median_money([Decimal("10.00"), Decimal("30.00"), Decimal("20.00")]) == Decimal(
        "20.00"
    )
    assert _median_money(
        [Decimal("10.00"), Decimal("20.00"), Decimal("30.00"), Decimal("40.00")]
    ) == Decimal("25.00")


def test_median_raise_after_three_spread_overruns() -> None:
    cid = uuid4()
    # Over in Jan, Apr, Jul — not a contiguous seasonal cluster.
    samples = [
        _sample(1, "100.00", "130.00"),  # +30
        _sample(2, "100.00", "90.00"),
        _sample(3, "100.00", "95.00"),
        _sample(4, "100.00", "150.00"),  # +50
        _sample(5, "100.00", "80.00"),
        _sample(6, "100.00", "100.00"),
        _sample(7, "100.00", "140.00"),  # +40
        _sample(8, "100.00", "70.00"),
    ]
    accum = {
        cid: {
            "name": "Dining",
            "kind": CategoryKind.expense,
            "samples": samples,
        }
    }
    suggestions = build_plan_suggestions(
        2026, accum, today=date(2026, 8, 12)
    )
    assert len(suggestions) == 1
    s = suggestions[0]
    assert s.suggestion_kind == "median_raise"
    assert s.months_over == 3
    assert s.median_overrun == Decimal("40.00")
    assert s.apply_year == 2026
    assert s.apply_month == 8
    assert s.current_planned == Decimal("100.00")
    assert s.suggested_planned == Decimal("140.00")
    assert "median overrun" in s.message.lower()


def test_seasonal_contiguous_cluster() -> None:
    cid = uuid4()
    samples = [
        _sample(1, "200.00", "150.00"),
        _sample(2, "200.00", "180.00"),
        _sample(6, "200.00", "260.00"),
        _sample(7, "200.00", "280.00"),
        _sample(8, "200.00", "250.00"),
        _sample(9, "200.00", "190.00"),
        _sample(10, "200.00", "175.00"),
    ]
    accum = {
        cid: {
            "name": "Travel",
            "kind": CategoryKind.expense,
            "samples": samples,
        }
    }
    suggestions = build_plan_suggestions(
        2026, accum, today=date(2026, 10, 1)
    )
    assert len(suggestions) == 1
    s = suggestions[0]
    assert s.suggestion_kind == "seasonal"
    assert s.months_over == 3
    assert s.median_overrun is None
    assert s.suggested_planned is None
    assert "seasonal" in s.message.lower()


def test_below_threshold_no_suggestion() -> None:
    cid = uuid4()
    samples = [
        _sample(1, "100.00", "150.00"),
        _sample(2, "100.00", "160.00"),
        _sample(3, "100.00", "90.00"),
    ]
    accum = {
        cid: {
            "name": "Groceries",
            "kind": CategoryKind.expense,
            "samples": samples,
        }
    }
    assert build_plan_suggestions(2026, accum, today=date(2026, 8, 1)) == []


def test_income_categories_skipped() -> None:
    cid = uuid4()
    samples = [
        _sample(1, "3000.00", "2500.00", over=True),
        _sample(2, "3000.00", "2400.00", over=True),
        _sample(3, "3000.00", "2600.00", over=True),
    ]
    accum = {
        cid: {
            "name": "Paycheck",
            "kind": CategoryKind.income,
            "samples": samples,
        }
    }
    assert build_plan_suggestions(2026, accum, today=date(2026, 8, 1)) == []


def test_apply_target_uses_latest_plan_in_past_year() -> None:
    cid = uuid4()
    samples = [
        _sample(1, "100.00", "140.00"),
        _sample(3, "110.00", "160.00"),
        _sample(5, "120.00", "170.00"),
        _sample(6, "120.00", "100.00"),
        _sample(8, "120.00", "180.00"),
    ]
    accum = {
        cid: {
            "name": "Utilities",
            "kind": CategoryKind.expense,
            "samples": samples,
        }
    }
    suggestions = build_plan_suggestions(
        2025, accum, today=date(2026, 8, 12)
    )
    assert len(suggestions) == 1
    s = suggestions[0]
    assert s.suggestion_kind == "median_raise"
    assert s.apply_year == 2025
    assert s.apply_month == 8  # latest with a plan line in samples
    assert s.current_planned == Decimal("120.00")
