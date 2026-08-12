"""Recurring schedule routes: CRUD, due logging, pattern tips, income estimate."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.enums import CategoryKind, RecurrenceFrequency
from app.models import Category, RecurringSchedule, Transaction, User
from app.schemas import (
    IncomeEstimateCategoryOut,
    IncomeEstimateOut,
    MessageOut,
    RecurringLogRequest,
    RecurringLogResultOut,
    RecurringPatternSuggestionListOut,
    RecurringPatternSuggestionOut,
    RecurringScheduleCreate,
    RecurringScheduleListOut,
    RecurringScheduleOut,
    RecurringScheduleUpdate,
    TransactionOut,
)
from app.services.recurring import (
    advance_occurrence,
    detect_patterns,
    estimate_income_for_month,
    next_occurrence_on_or_after,
    validate_anchor_day,
)

router = APIRouter(prefix="/recurring-schedules", tags=["recurring-schedules"])


def _validate_amount_for_kind(kind: str, amount) -> None:
    if kind in (CategoryKind.income.value, CategoryKind.expense.value) and amount < 0:
        raise HTTPException(
            status_code=400,
            detail=f"{kind} amounts must be positive",
        )


def _load_schedule(db: Session, user: User, schedule_id: UUID) -> RecurringSchedule:
    sched = db.scalar(
        select(RecurringSchedule)
        .options(joinedload(RecurringSchedule.category))
        .where(RecurringSchedule.id == schedule_id, RecurringSchedule.user_id == user.id)
    )
    if sched is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return sched


def _schedule_out(sched: RecurringSchedule, *, as_of: date | None = None) -> RecurringScheduleOut:
    today = as_of or date.today()
    out = RecurringScheduleOut.model_validate(sched)
    out.is_due = bool(sched.active and sched.next_occurrence <= today)
    return out


def _get_category(db: Session, user: User, category_id: UUID) -> Category:
    cat = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


@router.get("", response_model=RecurringScheduleListOut)
def list_schedules(
    active_only: bool = Query(True),
    kind: CategoryKind | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringScheduleListOut:
    stmt = (
        select(RecurringSchedule)
        .options(joinedload(RecurringSchedule.category))
        .where(RecurringSchedule.user_id == user.id)
        .order_by(RecurringSchedule.next_occurrence.asc())
    )
    if active_only:
        stmt = stmt.where(RecurringSchedule.active.is_(True))
    items = list(db.scalars(stmt).unique().all())
    if kind is not None:
        items = [s for s in items if s.category and s.category.kind == kind.value]
    today = date.today()
    return RecurringScheduleListOut(items=[_schedule_out(s, as_of=today) for s in items])


@router.get("/due", response_model=RecurringScheduleListOut)
def list_due(
    within_days: int = Query(0, ge=0, le=30, description="Include upcoming within N days"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringScheduleListOut:
    today = date.today()
    horizon = today if within_days == 0 else date.fromordinal(today.toordinal() + within_days)
    items = list(
        db.scalars(
            select(RecurringSchedule)
            .options(joinedload(RecurringSchedule.category))
            .where(
                RecurringSchedule.user_id == user.id,
                RecurringSchedule.active.is_(True),
                RecurringSchedule.next_occurrence <= horizon,
            )
            .order_by(RecurringSchedule.next_occurrence.asc())
        )
        .unique()
        .all()
    )
    # Exclude past end_date
    items = [s for s in items if s.end_date is None or s.next_occurrence <= s.end_date]
    return RecurringScheduleListOut(items=[_schedule_out(s, as_of=today) for s in items])


@router.get("/suggestions", response_model=RecurringPatternSuggestionListOut)
def pattern_suggestions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringPatternSuggestionListOut:
    raw = detect_patterns(db, user)
    return RecurringPatternSuggestionListOut(
        items=[RecurringPatternSuggestionOut(**row) for row in raw]
    )


@router.get("/income-estimate", response_model=IncomeEstimateOut)
def income_estimate(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncomeEstimateOut:
    data = estimate_income_for_month(db, user, year=year, month=month)
    return IncomeEstimateOut(
        year=data["year"],
        month=data["month"],
        estimated_total=data["estimated_total"],
        planned_total=data["planned_total"],
        actual_to_date=data["actual_to_date"],
        categories=[IncomeEstimateCategoryOut(**c) for c in data["categories"]],
        based_on_schedules=data["based_on_schedules"],
        based_on_history=data["based_on_history"],
        message=data["message"],
    )


@router.post("", response_model=RecurringScheduleOut, status_code=status.HTTP_201_CREATED)
def create_schedule(
    body: RecurringScheduleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringScheduleOut:
    cat = _get_category(db, user, body.category_id)
    if cat.archived:
        raise HTTPException(status_code=400, detail="Cannot schedule an archived category")
    if cat.kind == CategoryKind.savings.value:
        raise HTTPException(
            status_code=400,
            detail="Recurring schedules are for income and expense categories",
        )
    _validate_amount_for_kind(cat.kind, body.amount)
    try:
        anchor = validate_anchor_day(body.frequency, body.anchor_day)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # For semimonthly, normalize anchor to 1.
    if body.frequency == RecurrenceFrequency.semimonthly:
        anchor = 1

    next_date = next_occurrence_on_or_after(
        frequency=body.frequency,
        anchor_day=anchor,
        start_date=body.start_date,
        on_or_after=body.start_date,
    )
    sched = RecurringSchedule(
        user_id=user.id,
        category_id=body.category_id,
        amount=body.amount,
        note=body.note,
        frequency=body.frequency.value,
        anchor_day=anchor,
        start_date=body.start_date,
        end_date=body.end_date,
        next_occurrence=next_date,
        active=body.active,
    )
    db.add(sched)
    db.commit()
    return _schedule_out(_load_schedule(db, user, sched.id))


@router.get("/{schedule_id}", response_model=RecurringScheduleOut)
def get_schedule(
    schedule_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringScheduleOut:
    return _schedule_out(_load_schedule(db, user, schedule_id))


@router.patch("/{schedule_id}", response_model=RecurringScheduleOut)
def update_schedule(
    schedule_id: UUID,
    body: RecurringScheduleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringScheduleOut:
    sched = _load_schedule(db, user, schedule_id)
    updates = body.model_dump(exclude_unset=True)

    category_id = updates.get("category_id", sched.category_id)
    cat = _get_category(db, user, category_id)
    if cat.kind == CategoryKind.savings.value:
        raise HTTPException(
            status_code=400,
            detail="Recurring schedules are for income and expense categories",
        )
    amount = updates.get("amount", sched.amount)
    _validate_amount_for_kind(cat.kind, amount)

    frequency = updates.get("frequency", RecurrenceFrequency(sched.frequency))
    if isinstance(frequency, str):
        frequency = RecurrenceFrequency(frequency)
    anchor = updates.get("anchor_day", sched.anchor_day)
    try:
        anchor = validate_anchor_day(frequency, anchor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if frequency == RecurrenceFrequency.semimonthly:
        anchor = 1

    start_date = updates.get("start_date", sched.start_date)
    end_date = updates.get("end_date", sched.end_date)
    if end_date is not None and end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")

    sched.category_id = category_id
    sched.amount = amount
    if "note" in updates:
        sched.note = updates["note"]
    sched.frequency = frequency.value
    sched.anchor_day = anchor
    sched.start_date = start_date
    if "end_date" in updates:
        sched.end_date = end_date
    if "active" in updates:
        sched.active = updates["active"]

    if "next_occurrence" in updates and updates["next_occurrence"] is not None:
        sched.next_occurrence = updates["next_occurrence"]
    elif any(k in updates for k in ("frequency", "anchor_day", "start_date")):
        # Recalculate next from today so edits stay useful.
        sched.next_occurrence = next_occurrence_on_or_after(
            frequency=frequency,
            anchor_day=anchor,
            start_date=start_date,
            on_or_after=max(start_date, date.today()),
        )

    db.add(sched)
    db.commit()
    return _schedule_out(_load_schedule(db, user, sched.id))


@router.delete("/{schedule_id}", response_model=MessageOut)
def delete_schedule(
    schedule_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    sched = db.scalar(
        select(RecurringSchedule).where(
            RecurringSchedule.id == schedule_id, RecurringSchedule.user_id == user.id
        )
    )
    if sched is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(sched)
    db.commit()
    return MessageOut(detail="Schedule deleted")


@router.post("/{schedule_id}/log", response_model=RecurringLogResultOut)
def log_occurrence(
    schedule_id: UUID,
    body: RecurringLogRequest | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringLogResultOut:
    """Create a tracker transaction for the due occurrence and advance the schedule."""
    body = body or RecurringLogRequest()
    sched = _load_schedule(db, user, schedule_id)
    if not sched.active:
        raise HTTPException(status_code=400, detail="Schedule is inactive")
    cat = sched.category
    if cat is None:
        raise HTTPException(status_code=400, detail="Schedule category missing")

    amount = body.amount if body.amount is not None else sched.amount
    _validate_amount_for_kind(cat.kind, amount)
    tx_date = body.date if body.date is not None else sched.next_occurrence
    note = body.note if body.note is not None else sched.note

    tx = Transaction(
        user_id=user.id,
        category_id=sched.category_id,
        amount=amount,
        date=tx_date,
        note=note,
    )
    db.add(tx)

    next_date = advance_occurrence(sched, after=sched.next_occurrence)
    if sched.end_date and next_date > sched.end_date:
        sched.active = False
    sched.next_occurrence = next_date
    db.add(sched)
    db.commit()

    tx = db.scalar(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(Transaction.id == tx.id)
    )
    refreshed = _load_schedule(db, user, schedule_id)
    return RecurringLogResultOut(
        transaction=TransactionOut.model_validate(tx),
        schedule=_schedule_out(refreshed),
    )


@router.post("/{schedule_id}/skip", response_model=RecurringScheduleOut)
def skip_occurrence(
    schedule_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringScheduleOut:
    """Advance past the current due date without logging a transaction."""
    sched = _load_schedule(db, user, schedule_id)
    if not sched.active:
        raise HTTPException(status_code=400, detail="Schedule is inactive")
    next_date = advance_occurrence(sched, after=sched.next_occurrence)
    if sched.end_date and next_date > sched.end_date:
        sched.active = False
    sched.next_occurrence = next_date
    db.add(sched)
    db.commit()
    return _schedule_out(_load_schedule(db, user, schedule_id))
