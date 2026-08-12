"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.enums import CategoryKind, ViewMode


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
    date: Optional[date] = None
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


class MonthlyDashboardOut(BaseModel):
    year: int
    month: int
    income: KindTotals
    expense: KindTotals
    savings: KindTotals
    categories: list[CategoryProgress]
    savings_buckets: list[SavingsBucketOut]


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


class AnnualDashboardOut(BaseModel):
    year: int
    months: list[MonthlyTrendPoint]
    category_trends: list[CategoryTrend]
    income: KindTotals
    expense: KindTotals
    savings: KindTotals
    savings_buckets: list[SavingsBucketOut]


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
