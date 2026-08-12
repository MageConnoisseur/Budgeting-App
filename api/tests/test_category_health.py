"""Unit tests for category health scores (plan vs actual over ~6 months)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.enums import CategoryKind
from app.services.category_health import (
    _lookback_months,
    build_category_health_scores,
)

ZERO = Decimal("0.00")


def _sample(month: int, planned: str, actual: str, *, over: bool | None = None) -> dict:
    p = Decimal(planned)
    a = Decimal(actual)
    is_over = over if over is not None else (a > p and p > ZERO)
    return {"month": month, "planned": p, "actual": a, "over": is_over}


def test_lookback_months_current_year() -> None:
    assert _lookback_months(2026, date(2026, 8, 12)) == [3, 4, 5, 6, 7, 8]


def test_lookback_months_past_year_uses_last_six() -> None:
    assert _lookback_months(2025, date(2026, 8, 12)) == [7, 8, 9, 10, 11, 12]


def test_lookback_months_future_year_empty() -> None:
    assert _lookback_months(2027, date(2026, 8, 12)) == []


def test_stable_when_actuals_track_plan() -> None:
    cid = uuid4()
    samples = [
        _sample(3, "100.00", "98.00"),
        _sample(4, "100.00", "102.00"),
        _sample(5, "100.00", "97.00"),
        _sample(6, "100.00", "101.00"),
        _sample(7, "100.00", "99.00"),
        _sample(8, "100.00", "100.00"),
    ]
    accum = {
        cid: {
            "name": "Groceries",
            "kind": CategoryKind.expense,
            "samples": samples,
        }
    }
    scores = build_category_health_scores(
        2026, accum, today=date(2026, 8, 12)
    )
    assert len(scores) == 1
    s = scores[0]
    assert s.status == "stable"
    assert s.months_scored == 6
    assert s.months_over_budget <= 2
    assert "stable" in s.message.lower()


def test_under_planned_when_repeated_overruns() -> None:
    cid = uuid4()
    samples = [
        _sample(3, "100.00", "140.00"),
        _sample(4, "100.00", "130.00"),
        _sample(5, "100.00", "150.00"),
        _sample(6, "100.00", "125.00"),
        _sample(7, "100.00", "110.00"),
        _sample(8, "100.00", "135.00"),
    ]
    accum = {
        cid: {
            "name": "Dining",
            "kind": CategoryKind.expense,
            "samples": samples,
        }
    }
    scores = build_category_health_scores(
        2026, accum, today=date(2026, 8, 12)
    )
    assert len(scores) == 1
    s = scores[0]
    assert s.status == "under_planned"
    assert s.months_over_budget >= 3
    assert "under-planned" in s.message.lower() or "raising" in s.message.lower()


def test_volatile_when_ratios_swing() -> None:
    cid = uuid4()
    # Large swings but only 2 overruns — high CV, not chronic under-planning.
    samples = [
        _sample(3, "100.00", "220.00"),
        _sample(4, "100.00", "30.00"),
        _sample(5, "100.00", "45.00"),
        _sample(6, "100.00", "55.00"),
        _sample(7, "100.00", "200.00"),
        _sample(8, "100.00", "40.00"),
    ]
    accum = {
        cid: {
            "name": "Travel",
            "kind": CategoryKind.expense,
            "samples": samples,
        }
    }
    scores = build_category_health_scores(
        2026, accum, today=date(2026, 8, 12)
    )
    assert len(scores) == 1
    s = scores[0]
    assert s.status == "volatile"
    assert s.volatility >= 0.28
    assert s.months_over_budget == 2
    assert "volatile" in s.message.lower()


def test_insufficient_history_skipped() -> None:
    cid = uuid4()
    samples = [
        _sample(7, "100.00", "120.00"),
        _sample(8, "100.00", "130.00"),
    ]
    accum = {
        cid: {
            "name": "Coffee",
            "kind": CategoryKind.expense,
            "samples": samples,
        }
    }
    assert (
        build_category_health_scores(2026, accum, today=date(2026, 8, 12))
        == []
    )


def test_income_categories_skipped() -> None:
    cid = uuid4()
    samples = [
        _sample(3, "3000.00", "3000.00"),
        _sample(4, "3000.00", "3100.00"),
        _sample(5, "3000.00", "2900.00"),
        _sample(6, "3000.00", "3000.00"),
        _sample(7, "3000.00", "3050.00"),
        _sample(8, "3000.00", "2950.00"),
    ]
    accum = {
        cid: {
            "name": "Paycheck",
            "kind": CategoryKind.income,
            "samples": samples,
        }
    }
    assert (
        build_category_health_scores(2026, accum, today=date(2026, 8, 12))
        == []
    )


def test_sort_puts_under_planned_first() -> None:
    stable_id = uuid4()
    under_id = uuid4()
    accum = {
        stable_id: {
            "name": "Utilities",
            "kind": CategoryKind.expense,
            "samples": [
                _sample(m, "80.00", "78.00") for m in range(3, 9)
            ],
        },
        under_id: {
            "name": "Dining",
            "kind": CategoryKind.expense,
            "samples": [
                _sample(m, "100.00", "140.00") for m in range(3, 9)
            ],
        },
    }
    scores = build_category_health_scores(
        2026, accum, today=date(2026, 8, 12)
    )
    assert [s.status for s in scores] == ["under_planned", "stable"]
