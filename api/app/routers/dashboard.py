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
    DashboardLayoutPreset,
    DashboardLayoutUpdate,
    DashboardWidget,
    MonthlyDashboardOut,
    SavingsBucketOut,
)
from app.services import dashboard as dashboard_service
from app.services.dashboard_layout import seed_layout

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


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
    today = date.today()
    zero = Decimal("0.00")
    return [
        dashboard_service.build_savings_bucket(
            category=c,
            balance=balances.get(c.id, zero),
            planned_this_period=zero,
            actual_this_period=zero,
            monthly_contribution=dashboard_service.latest_monthly_contribution(
                db, user.id, c.id, year=today.year, month=today.month
            ),
            from_year=today.year,
            from_month=today.month,
        )
        for c in cats
    ]


def _parse_layout_doc(
    raw: str,
) -> tuple[list[DashboardWidget], list[DashboardLayoutPreset], str | None]:
    """Accept legacy widget arrays and v2 {widgets, presets} envelopes."""
    data = json.loads(raw)
    if isinstance(data, list):
        widgets = [DashboardWidget.model_validate(w) for w in data]
        return widgets, [], None
    if not isinstance(data, dict):
        return [], [], None
    widgets = [DashboardWidget.model_validate(w) for w in (data.get("widgets") or [])]
    presets = [
        DashboardLayoutPreset.model_validate(p) for p in (data.get("presets") or [])
    ]
    active = data.get("active_preset_id")
    active_id = active if isinstance(active, str) else None
    return widgets, presets, active_id


def _dump_layout_doc(
    widgets: list[DashboardWidget],
    presets: list[DashboardLayoutPreset] | None,
    active_preset_id: str | None,
) -> str:
    if not presets and not active_preset_id:
        return json.dumps([w.model_dump() for w in widgets])
    return json.dumps(
        {
            "v": 2,
            "widgets": [w.model_dump() for w in widgets],
            "presets": [p.model_dump() for p in (presets or [])],
            "active_preset_id": active_preset_id,
        }
    )


@router.get("/layout/{view_mode}", response_model=DashboardLayoutOut)
def get_layout(
    view_mode: ViewMode,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardLayoutOut:
    row = db.scalar(
        select(DashboardLayout).where(
            DashboardLayout.user_id == user.id,
            DashboardLayout.view_mode == view_mode.value,
        )
    )
    if row is None:
        widgets, presets, active_id = seed_layout(None, [], None, view_mode)
    else:
        saved_widgets, saved_presets, saved_active = _parse_layout_doc(row.layout_json)
        widgets, presets, active_id = seed_layout(
            saved_widgets, saved_presets, saved_active, view_mode
        )
    return DashboardLayoutOut(
        view_mode=view_mode,
        widgets=widgets,
        presets=presets,
        active_preset_id=active_id,
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
    presets = body.presets or []
    payload = _dump_layout_doc(body.widgets, presets, body.active_preset_id)
    if row is None:
        row = DashboardLayout(
            user_id=user.id, view_mode=view_mode.value, layout_json=payload
        )
        db.add(row)
    else:
        row.layout_json = payload
        db.add(row)
    db.commit()
    return DashboardLayoutOut(
        view_mode=view_mode,
        widgets=body.widgets,
        presets=presets,
        active_preset_id=body.active_preset_id,
    )
