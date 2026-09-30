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


class ImportSource(str, enum.Enum):
    """Statement parser id. Add a parser module when a new bank CSV is supported."""

    discover = "discover"


class ImportCandidateStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    skipped = "skipped"
    merged = "merged"


class ImportMatchKind(str, enum.Enum):
    none = "none"
    fuzzy = "fuzzy"


# Amount convention (documented for clients):
# - Amounts are Decimal with 2 fractional digits, USD only in v1.
# - Income / expense transactions: amount is always > 0 (money received / spent).
# - Savings transactions: amount > 0 contributes (to a bucket, or toward a
#   non-bucket savings line such as extra loan payments); amount < 0 withdraws
#   from a bucket. Zero is rejected.
