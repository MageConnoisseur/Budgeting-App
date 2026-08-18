"""Savings-funded expenses: validation and paycheck leftover math.

An expense budget line may be marked as paid from a savings bucket. That is the
planned *use* of the bucket. Contribution plans stay non-negative.

Paycheck leftover (plan or actual) is:

    income − expenses paid from this period's income − savings contributions

Expenses paid from a bucket do not compete with this month's paycheck.
Savings withdrawals (negative tracker amounts) are not contributions.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.enums import CategoryKind
from app.models import BudgetLine, BudgetMonth, Category, Transaction, User
from app.schemas import PaycheckLeftoverOut

ZERO = Decimal("0.00")
MONEY = Decimal("0.01")

MONTH_LOAD_OPTIONS = (
    joinedload(BudgetMonth.lines).joinedload(BudgetLine.category),
    joinedload(BudgetMonth.lines).joinedload(BudgetLine.funded_by_category),
)


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def paycheck_leftover(
    *,
    income: Decimal,
    expense_from_income: Decimal,
    savings_contributions: Decimal,
    expense_from_savings: Decimal = ZERO,
) -> PaycheckLeftoverOut:
    """Income minus unfunded expenses minus contributions (not withdrawals)."""
    inc = _money(income)
    from_income = _money(expense_from_income)
    contrib = _money(savings_contributions)
    from_savings = _money(expense_from_savings)
    return PaycheckLeftoverOut(
        income=inc,
        expense_from_income=from_income,
        expense_from_savings=from_savings,
        savings_contributions=contrib,
        leftover=_money(inc - from_income - contrib),
    )


def add_leftovers(a: PaycheckLeftoverOut, b: PaycheckLeftoverOut) -> PaycheckLeftoverOut:
    return paycheck_leftover(
        income=a.income + b.income,
        expense_from_income=a.expense_from_income + b.expense_from_income,
        savings_contributions=a.savings_contributions + b.savings_contributions,
        expense_from_savings=a.expense_from_savings + b.expense_from_savings,
    )


def resolve_funded_by(
    db: Session,
    user: User,
    *,
    line_category: Category,
    funded_by_category_id: UUID | None,
) -> UUID | None:
    """Validate and return a savings category id, or None for paycheck-funded."""
    if funded_by_category_id is None:
        return None
    if line_category.kind != CategoryKind.expense.value:
        raise HTTPException(
            status_code=400,
            detail="Only expense lines can be paid from a savings bucket",
        )
    fund = db.scalar(
        select(Category).where(
            Category.id == funded_by_category_id,
            Category.user_id == user.id,
        )
    )
    if fund is None:
        raise HTTPException(status_code=404, detail="Savings bucket not found")
    if fund.kind != CategoryKind.savings.value:
        raise HTTPException(
            status_code=400,
            detail="Expenses can only be paid from a savings bucket",
        )
    return fund.id


def funding_by_expense(budget_month: BudgetMonth | None) -> dict[UUID, Category]:
    """Map expense category id → savings Category for funded lines."""
    if budget_month is None:
        return {}
    out: dict[UUID, Category] = {}
    for line in budget_month.lines:
        if line.funded_by_category_id is None:
            continue
        cat = line.category
        fund = line.funded_by_category
        if cat is None or cat.kind != CategoryKind.expense.value:
            continue
        if fund is None:
            continue
        out[line.category_id] = fund
    return out


def planned_use_by_bucket(budget_month: BudgetMonth | None) -> dict[UUID, Decimal]:
    """Sum of expense plans paid from each savings bucket this month."""
    if budget_month is None:
        return {}
    totals: dict[UUID, Decimal] = {}
    for line in budget_month.lines:
        if line.funded_by_category_id is None:
            continue
        cat = line.category
        if cat is None or cat.kind != CategoryKind.expense.value:
            continue
        totals[line.funded_by_category_id] = _money(
            totals.get(line.funded_by_category_id, ZERO) + line.planned_amount
        )
    return totals


def get_expense_funding(
    db: Session, user: User, year: int, month: int, category_id: UUID
) -> tuple[UUID | None, str | None]:
    """Look up an expense line's bucket without creating a budget month."""
    line = db.scalar(
        select(BudgetLine)
        .join(BudgetMonth)
        .options(joinedload(BudgetLine.funded_by_category))
        .where(
            BudgetMonth.user_id == user.id,
            BudgetMonth.year == year,
            BudgetMonth.month == month,
            BudgetLine.category_id == category_id,
        )
    )
    if line is None or line.funded_by_category is None:
        return None, None
    fund = line.funded_by_category
    return fund.id, fund.name


def savings_flows(
    db: Session, user_id: UUID, start, end
) -> tuple[dict[UUID, Decimal], dict[UUID, Decimal]]:
    """Positive deposits and absolute withdrawals per savings category."""
    txs = db.scalars(
        select(Transaction)
        .join(Category)
        .where(
            Transaction.user_id == user_id,
            Category.kind == CategoryKind.savings.value,
            Transaction.date >= start,
            Transaction.date <= end,
        )
    ).all()
    deposits: dict[UUID, Decimal] = {}
    withdrawals: dict[UUID, Decimal] = {}
    for tx in txs:
        if tx.amount > ZERO:
            deposits[tx.category_id] = deposits.get(tx.category_id, ZERO) + tx.amount
        elif tx.amount < ZERO:
            withdrawals[tx.category_id] = withdrawals.get(tx.category_id, ZERO) + (
                -tx.amount
            )
    return deposits, withdrawals
