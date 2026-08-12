"""Dashboard insight routes (monthly / annual) and widget layouts."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.enums import ViewMode
from app.models import DashboardLayout, User
from app.schemas import (
    AnnualDashboardOut,
    DashboardLayoutOut,
    DashboardLayoutUpdate,
    DashboardWidget,
    MonthlyDashboardOut,
    SavingsBucketOut,
)
from app.services import dashboard as dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

DEFAULT_MONTHLY_WIDGETS = [
    DashboardWidget(id="spending-pace", type="spending_pace", title="Spending pace", order=0, config={}),
    DashboardWidget(id="income-progress", type="kind_progress", title="Income", order=1, config={"kind": "income"}),
    DashboardWidget(id="expense-progress", type="kind_progress", title="Expenses", order=2, config={"kind": "expense"}),
    DashboardWidget(id="savings-progress", type="kind_progress", title="Savings", order=3, config={"kind": "savings"}),
    DashboardWidget(id="cashflow-trend", type="cashflow_trend", title="Year cash-flow trend", order=4, config={}),
    DashboardWidget(id="savings-buckets", type="savings_buckets", title="Savings buckets", order=5, config={}),
    DashboardWidget(id="category-breakdown", type="category_breakdown", title="Categories", order=6, config={}),
    # Append-only id — order 0 keeps it near the top after sort without renumbering peers.
    DashboardWidget(id="true-leftover", type="true_leftover", title="True leftover", order=0, config={}),
]

DEFAULT_ANNUAL_WIDGETS = [
    DashboardWidget(id="spending-pace-year", type="spending_pace", title="Spending pace", order=0, config={}),
    DashboardWidget(id="year-totals", type="year_totals", title="Year totals", order=1, config={}),
    DashboardWidget(id="month-trends", type="month_trends", title="Month-to-month trends", order=2, config={}),
    DashboardWidget(id="over-budget-patterns", type="category_trends", title="Repeated overruns", order=3, config={}),
    DashboardWidget(id="savings-buckets-year", type="savings_buckets", title="Savings buckets", order=4, config={}),
    DashboardWidget(id="true-leftover-year", type="true_leftover", title="True leftover", order=0, config={}),
]


@router.get("/monthly/{year}/{month}", response_model=MonthlyDashboardOut)
def monthly_dashboard(
    year: int,
    month: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MonthlyDashboardOut:
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be 1-12")
    return dashboard_service.build_monthly_dashboard(db, user, year, month)


@router.get("/annual/{year}", response_model=AnnualDashboardOut)
def annual_dashboard(
    year: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnualDashboardOut:
    return dashboard_service.build_annual_dashboard(db, user, year)


@router.get("/savings-balances", response_model=list[SavingsBucketOut])
def savings_balances(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SavingsBucketOut]:
    """Current savings bucket balances (derived from the transaction ledger)."""
    from datetime import date

    from app.enums import CategoryKind
    from app.models import Category
    from decimal import Decimal

    balances = dashboard_service.savings_balances(db, user.id)
    cats = db.scalars(
        select(Category).where(
            Category.user_id == user.id,
            Category.kind == CategoryKind.savings.value,
            Category.archived.is_(False),
        )
    ).all()
    zero = Decimal("0.00")
    return [
        SavingsBucketOut(
            category_id=c.id,
            category_name=c.name,
            balance=balances.get(c.id, zero),
            planned_this_period=zero,
            actual_this_period=zero,
            over_budget=False,
        )
        for c in cats
    ]


def _merge_default_widgets(
    saved: list[DashboardWidget], defaults: list[DashboardWidget]
) -> list[DashboardWidget]:
    """Keep saved order/config; append any new default widgets the user lacks."""
    have = {w.id for w in saved}
    merged = list(saved)
    next_order = max((w.order for w in saved), default=-1) + 1
    for w in defaults:
        if w.id not in have:
            merged.append(w.model_copy(update={"order": next_order}))
            next_order += 1
    return merged


@router.get("/layout/{view_mode}", response_model=DashboardLayoutOut)
def get_layout(
    view_mode: ViewMode,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardLayoutOut:
    defaults = (
        DEFAULT_MONTHLY_WIDGETS
        if view_mode == ViewMode.monthly
        else DEFAULT_ANNUAL_WIDGETS
    )
    row = db.scalar(
        select(DashboardLayout).where(
            DashboardLayout.user_id == user.id,
            DashboardLayout.view_mode == view_mode.value,
        )
    )
    if row is None:
        return DashboardLayoutOut(view_mode=view_mode, widgets=defaults)
    widgets = [DashboardWidget.model_validate(w) for w in json.loads(row.layout_json)]
    return DashboardLayoutOut(
        view_mode=view_mode,
        widgets=_merge_default_widgets(widgets, defaults),
    )


@router.put("/layout/{view_mode}", response_model=DashboardLayoutOut)
def put_layout(
    view_mode: ViewMode,
    body: DashboardLayoutUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardLayoutOut:
    row = db.scalar(
        select(DashboardLayout).where(
            DashboardLayout.user_id == user.id,
            DashboardLayout.view_mode == view_mode.value,
        )
    )
    payload = json.dumps([w.model_dump() for w in body.widgets])
    if row is None:
        row = DashboardLayout(
            user_id=user.id, view_mode=view_mode.value, layout_json=payload
        )
        db.add(row)
    else:
        row.layout_json = payload
        db.add(row)
    db.commit()
    return DashboardLayoutOut(view_mode=view_mode, widgets=body.widgets)
