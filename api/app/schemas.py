"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import date, datetime
from datetime import date as Date
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.enums import CategoryKind, RecurrenceFrequency, ViewMode


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth ---


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_\-\.]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """`username` may be the account username or email address."""

    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserPreferencesUpdate(BaseModel):
    preferred_budget_view: Optional[ViewMode] = None
    preferred_dashboard_view: Optional[ViewMode] = None


class UserProfileUpdate(BaseModel):
    """Attach or change the recovery email on an existing account."""

    email: EmailStr


class OAuthProviderInfo(BaseModel):
    id: str
    name: str
    configured: bool


class UserOut(ORMModel):
    id: UUID
    username: str
    email: Optional[str] = None
    has_password: bool = False
    oauth_providers: list[str] = []
    preferred_budget_view: ViewMode
    preferred_dashboard_view: ViewMode
    created_at: datetime


# --- Categories ---


class CategoryCreate(BaseModel):
    kind: CategoryKind
    name: str = Field(min_length=1, max_length=128)
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    archived: Optional[bool] = None
    sort_order: Optional[int] = None


class CategoryOut(ORMModel):
    id: UUID
    kind: CategoryKind
    name: str
    archived: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


# --- Budget ---


class MoneyAmount(BaseModel):
    """USD money amount with two decimal places (never floats)."""

    amount: Decimal = Field(..., max_digits=14, decimal_places=2)

    @field_validator("amount")
    @classmethod
    def quantize(cls, v: Decimal) -> Decimal:
        return v.quantize(Decimal("0.01"))


class BudgetLineOut(ORMModel):
    id: UUID
    category_id: UUID
    planned_amount: Decimal
    category: Optional[CategoryOut] = None


class BudgetMonthOut(ORMModel):
    id: UUID
    year: int
    month: int
    lines: list[BudgetLineOut] = []
    seeded_from: Optional[str] = None  # e.g. "2026-01" or "template:Default" or null
    created_at: datetime
    updated_at: datetime


class BudgetLineUpsert(BaseModel):
    category_id: UUID
    planned_amount: Decimal = Field(..., max_digits=14, decimal_places=2)

    @field_validator("planned_amount")
    @classmethod
    def non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("planned_amount must be >= 0")
        return v.quantize(Decimal("0.01"))


class BudgetMonthUpsert(BaseModel):
    """Replace or merge planned amounts for a month (Monthly or Annual cell edits)."""

    lines: list[BudgetLineUpsert]
    replace_all: bool = False  # if True, remove lines not in payload


class AnnualBudgetCell(BaseModel):
    year: int
    month: int
    category_id: UUID
    planned_amount: Decimal = Field(..., max_digits=14, decimal_places=2)

    @field_validator("planned_amount")
    @classmethod
    def non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("planned_amount must be >= 0")
        return v.quantize(Decimal("0.01"))

    @field_validator("month")
    @classmethod
    def valid_month(cls, v: int) -> int:
        if v < 1 or v > 12:
            raise ValueError("month must be 1-12")
        return v


class AnnualBudgetOut(BaseModel):
    year: int
    months: list[BudgetMonthOut]


class CopyFromMonthRequest(BaseModel):
    source_year: int
    source_month: int = Field(ge=1, le=12)


class SaveTemplateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    year: int
    month: int = Field(ge=1, le=12)


class ApplyTemplateRequest(BaseModel):
    template_id: UUID


class BudgetTemplateLineOut(ORMModel):
    id: UUID
    category_id: UUID
    planned_amount: Decimal


class BudgetTemplateOut(ORMModel):
    id: UUID
    name: str
    lines: list[BudgetTemplateLineOut] = []
    created_at: datetime
    updated_at: datetime


# --- Transactions ---


class TransactionCreate(BaseModel):
    category_id: UUID
    amount: Decimal = Field(..., max_digits=14, decimal_places=2)
    date: date
    note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("amount")
    @classmethod
    def quantize(cls, v: Decimal) -> Decimal:
        q = v.quantize(Decimal("0.01"))
        if q == 0:
            raise ValueError("amount must not be zero")
        return q


class TransactionUpdate(BaseModel):
    category_id: Optional[UUID] = None
    amount: Optional[Decimal] = Field(default=None, max_digits=14, decimal_places=2)
    # Use Date alias: `date: Optional[date] = None` shadows the type under PEP563.
    date: Optional[Date] = None
    note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("amount")
    @classmethod
    def quantize(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is None:
            return v
        q = v.quantize(Decimal("0.01"))
        if q == 0:
            raise ValueError("amount must not be zero")
        return q


class TransactionOut(ORMModel):
    id: UUID
    category_id: UUID
    amount: Decimal
    date: date
    note: Optional[str]
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryOut] = None


class TransactionListOut(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int


class NoteSuggestionOut(BaseModel):
    note: str
    use_count: int
    last_date: date
    last_amount: Decimal
    last_category_id: UUID
    last_category_name: str
    last_kind: CategoryKind


class NoteSuggestionListOut(BaseModel):
    items: list[NoteSuggestionOut]


# --- Dashboard ---


class CategoryProgress(BaseModel):
    category_id: UUID
    category_name: str
    kind: CategoryKind
    planned: Decimal
    actual: Decimal
    remaining: Decimal
    over_budget: bool  # soft warning flag only — never blocks logging


class KindTotals(BaseModel):
    planned: Decimal
    actual: Decimal
    remaining: Decimal
    over_budget: bool


class SavingsBucketOut(BaseModel):
    category_id: UUID
    category_name: str
    balance: Decimal
    planned_this_period: Decimal
    actual_this_period: Decimal
    over_budget: bool


class SpendingPaceDay(BaseModel):
    """One day inside the rolling pace window (cumulative totals are inclusive)."""

    date: date
    income: Decimal
    expense: Decimal
    savings: Decimal
    cumulative_income: Decimal
    cumulative_expense: Decimal
    cumulative_savings: Decimal
    cumulative_outflow: Decimal
    cumulative_net: Decimal
    cumulative_expected_income: Decimal


class SpendingPaceOut(BaseModel):
    """Rolling actual cash pace vs average income capacity (soft overspending signal)."""

    as_of: date
    window_start: date
    window_end: date
    window_days: int
    income: Decimal
    expense: Decimal
    savings: Decimal
    outflow: Decimal
    net: Decimal
    average_daily_income: Decimal
    expected_income: Decimal
    income_lookback_start: Optional[date] = None
    income_lookback_end: Optional[date] = None
    income_lookback_days: int = 0
    tracking_started_on: Optional[date] = None
    overspending: bool = False
    has_data: bool = False
    days: list[SpendingPaceDay] = Field(default_factory=list)


class MonthlyDashboardOut(BaseModel):
    year: int
    month: int
    income: KindTotals
    expense: KindTotals
    savings: KindTotals
    categories: list[CategoryProgress]
    savings_buckets: list[SavingsBucketOut]
    spending_pace: SpendingPaceOut


class MonthlyTrendPoint(BaseModel):
    year: int
    month: int
    income_planned: Decimal
    income_actual: Decimal
    expense_planned: Decimal
    expense_actual: Decimal
    savings_planned: Decimal
    savings_actual: Decimal


class CategoryTrend(BaseModel):
    category_id: UUID
    category_name: str
    kind: CategoryKind
    months_over_budget: int
    months_under_budget: int
    total_planned: Decimal
    total_actual: Decimal


class PlanSuggestion(BaseModel):
    """Soft optional coaching from multi-month overrun patterns."""

    category_id: UUID
    category_name: str
    kind: CategoryKind
    suggestion_kind: Literal["median_raise", "seasonal"]
    months_over: int
    median_overrun: Optional[Decimal] = None
    apply_year: Optional[int] = None
    apply_month: Optional[int] = None
    current_planned: Optional[Decimal] = None
    suggested_planned: Optional[Decimal] = None
    message: str


class CategoryHealthScore(BaseModel):
    """Plan-vs-actual consistency over ~6 months (stable / volatile / under-planned)."""

    category_id: UUID
    category_name: str
    kind: CategoryKind
    status: Literal["stable", "volatile", "under_planned"]
    months_scored: int
    months_over_budget: int
    mean_ratio: Decimal
    volatility: float
    lookback_months: int = 6
    message: str


class AnnualDashboardOut(BaseModel):
    year: int
    months: list[MonthlyTrendPoint]
    category_trends: list[CategoryTrend]
    plan_suggestions: list[PlanSuggestion] = Field(default_factory=list)
    category_health: list[CategoryHealthScore] = Field(default_factory=list)
    income: KindTotals
    expense: KindTotals
    savings: KindTotals
    savings_buckets: list[SavingsBucketOut]
    spending_pace: SpendingPaceOut


class DashboardWidget(BaseModel):
    id: str
    type: str
    title: Optional[str] = None
    config: dict[str, Any] = Field(default_factory=dict)
    order: int = 0


class DashboardLayoutOut(BaseModel):
    view_mode: ViewMode
    widgets: list[DashboardWidget]


class DashboardLayoutUpdate(BaseModel):
    widgets: list[DashboardWidget]


class MessageOut(BaseModel):
    detail: str


# --- Recurring schedules (tracker reminders) ---


class RecurringScheduleCreate(BaseModel):
    category_id: UUID
    amount: Decimal = Field(..., max_digits=14, decimal_places=2)
    note: Optional[str] = Field(default=None, max_length=2000)
    frequency: RecurrenceFrequency
    # weekly/biweekly: ISO weekday 1–7; monthly: day of month 1–28; semimonthly ignored.
    anchor_day: int = Field(default=1, ge=1, le=28)
    start_date: date
    end_date: Optional[date] = None
    active: bool = True

    @field_validator("amount")
    @classmethod
    def quantize_amount(cls, v: Decimal) -> Decimal:
        q = v.quantize(Decimal("0.01"))
        if q == 0:
            raise ValueError("amount must not be zero")
        return q

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v: Optional[date], info) -> Optional[date]:
        start = info.data.get("start_date")
        if v is not None and start is not None and v < start:
            raise ValueError("end_date must be on or after start_date")
        return v


class RecurringScheduleUpdate(BaseModel):
    category_id: Optional[UUID] = None
    amount: Optional[Decimal] = Field(default=None, max_digits=14, decimal_places=2)
    note: Optional[str] = Field(default=None, max_length=2000)
    frequency: Optional[RecurrenceFrequency] = None
    anchor_day: Optional[int] = Field(default=None, ge=1, le=28)
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    next_occurrence: Optional[Date] = None
    active: Optional[bool] = None

    @field_validator("amount")
    @classmethod
    def quantize_amount(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is None:
            return v
        q = v.quantize(Decimal("0.01"))
        if q == 0:
            raise ValueError("amount must not be zero")
        return q


class RecurringScheduleOut(ORMModel):
    id: UUID
    category_id: UUID
    amount: Decimal
    note: Optional[str]
    frequency: RecurrenceFrequency
    anchor_day: int
    start_date: date
    end_date: Optional[date]
    next_occurrence: date
    active: bool
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryOut] = None
    is_due: bool = False


class RecurringScheduleListOut(BaseModel):
    items: list[RecurringScheduleOut]


class RecurringLogRequest(BaseModel):
    """Optional overrides when logging a due schedule occurrence."""

    amount: Optional[Decimal] = Field(default=None, max_digits=14, decimal_places=2)
    date: Optional[Date] = None
    note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("amount")
    @classmethod
    def quantize_amount(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is None:
            return v
        q = v.quantize(Decimal("0.01"))
        if q == 0:
            raise ValueError("amount must not be zero")
        return q


class RecurringLogResultOut(BaseModel):
    transaction: TransactionOut
    schedule: RecurringScheduleOut


class RecurringPatternSuggestionOut(BaseModel):
    """Detected from tracker history — soft suggestion to create a schedule."""

    category_id: UUID
    category_name: str
    kind: CategoryKind
    suggested_amount: Decimal
    suggested_frequency: RecurrenceFrequency
    suggested_anchor_day: int
    sample_count: int
    average_interval_days: Decimal
    last_date: date
    sample_note: Optional[str] = None
    confidence: Literal["low", "medium", "high"]
    message: str


class RecurringPatternSuggestionListOut(BaseModel):
    items: list[RecurringPatternSuggestionOut]


class IncomeEstimateCategoryOut(BaseModel):
    category_id: UUID
    category_name: str
    estimated_amount: Decimal
    method: Literal["schedule", "history_median", "history_mean", "mixed"]
    occurrence_count: int
    sample_months: int
    message: str


class IncomeEstimateOut(BaseModel):
    year: int
    month: int
    estimated_total: Decimal
    planned_total: Decimal
    actual_to_date: Decimal
    categories: list[IncomeEstimateCategoryOut]
    based_on_schedules: int
    based_on_history: int
    message: str
