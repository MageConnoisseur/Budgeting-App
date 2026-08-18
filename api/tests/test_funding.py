"""Paycheck leftover helper for savings-funded expenses."""

from decimal import Decimal

from app.services.funding import paycheck_leftover

ZERO = Decimal("0.00")


def test_funded_expense_does_not_reduce_paycheck_leftover() -> None:
    # $4000 income, $2800 regular bills, $500 car shop from the bucket, $200 savings.
    out = paycheck_leftover(
        income=Decimal("4000.00"),
        expense_from_income=Decimal("2800.00"),
        savings_contributions=Decimal("200.00"),
        expense_from_savings=Decimal("500.00"),
    )
    assert out.leftover == Decimal("1000.00")
    assert out.expense_from_savings == Decimal("500.00")
    assert out.expense_from_income == Decimal("2800.00")


def test_unfunded_big_bill_does_reduce_leftover() -> None:
    out = paycheck_leftover(
        income=Decimal("4000.00"),
        expense_from_income=Decimal("3300.00"),
        savings_contributions=Decimal("200.00"),
        expense_from_savings=ZERO,
    )
    assert out.leftover == Decimal("500.00")
