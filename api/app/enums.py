"""Shared enums and constants."""

import enum


class CategoryKind(str, enum.Enum):
    income = "income"
    expense = "expense"
    savings = "savings"


class ViewMode(str, enum.Enum):
    monthly = "monthly"
    annual = "annual"


class RecurrenceFrequency(str, enum.Enum):
    """How often a scheduled income/expense is expected."""

    weekly = "weekly"
    biweekly = "biweekly"
    semimonthly = "semimonthly"  # typically 1st and 15th
    monthly = "monthly"


# Amount convention (documented for clients):
# - Amounts are Decimal with 2 fractional digits, USD only in v1.
# - Income / expense transactions: amount is always > 0 (money received / spent).
# - Savings transactions: amount > 0 contributes to the bucket; amount < 0
#   withdraws from the bucket. Zero is rejected.
