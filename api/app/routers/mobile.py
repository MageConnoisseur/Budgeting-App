"""Compact phone-logger routes. Additive contract — do not grow into a dashboard."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import MobileGlanceOut
from app.services import dashboard as dashboard_service

router = APIRouter(prefix="/mobile", tags=["mobile"])


@router.get("/glance", response_model=MobileGlanceOut)
def mobile_glance(
    year: int | None = Query(None, description="Calendar year; defaults to today"),
    month: int | None = Query(None, description="1-12; defaults to today"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MobileGlanceOut:
    """This month leftover per category. Does not seed a budget month."""
    today = date.today()
    y = year if year is not None else today.year
    m = month if month is not None else today.month
    if m < 1 or m > 12:
        raise HTTPException(status_code=400, detail="month must be 1-12")
    return dashboard_service.build_mobile_glance(db, user, y, m)
