"""Unit tests for savings target hit-month projection."""

from __future__ import annotations

from decimal import Decimal

from app.services.dashboard import project_savings_hit

ZERO = Decimal("0.00")


def test_no_target_yields_no_projection() -> None:
    reached, y, m = project_savings_hit(
        balance=Decimal("100.00"),
        target=None,
        monthly_contribution=Decimal("50.00"),
        from_year=2026,
        from_month=5,
    )
    assert reached is False
    assert y is None and m is None


def test_already_reached() -> None:
    reached, y, m = project_savings_hit(
        balance=Decimal("5000.00"),
        target=Decimal("5000.00"),
        monthly_contribution=Decimal("200.00"),
        from_year=2026,
        from_month=8,
    )
    assert reached is True
    assert (y, m) == (2026, 8)


def test_one_month_remaining_hits_this_month() -> None:
    reached, y, m = project_savings_hit(
        balance=Decimal("4800.00"),
        target=Decimal("5000.00"),
        monthly_contribution=Decimal("200.00"),
        from_year=2026,
        from_month=8,
    )
    assert reached is False
    assert (y, m) == (2026, 8)


def test_multi_month_projection_crosses_year() -> None:
    # Need $4000 at $200/mo → 20 months; start May 2026 → Dec 2027
    reached, y, m = project_savings_hit(
        balance=Decimal("1000.00"),
        target=Decimal("5000.00"),
        monthly_contribution=Decimal("200.00"),
        from_year=2026,
        from_month=5,
    )
    assert reached is False
    assert (y, m) == (2027, 12)


def test_partial_last_month_rounds_up() -> None:
    # $150 remaining at $100/mo → 2 months → next month
    reached, y, m = project_savings_hit(
        balance=Decimal("850.00"),
        target=Decimal("1000.00"),
        monthly_contribution=Decimal("100.00"),
        from_year=2026,
        from_month=1,
    )
    assert reached is False
    assert (y, m) == (2026, 2)


def test_zero_contribution_cannot_project() -> None:
    reached, y, m = project_savings_hit(
        balance=Decimal("100.00"),
        target=Decimal("1000.00"),
        monthly_contribution=ZERO,
        from_year=2026,
        from_month=1,
    )
    assert reached is False
    assert y is None and m is None
