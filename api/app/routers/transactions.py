"""Transaction tracker routes with search, sort, and filters."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.enums import CategoryKind
from app.models import Category, Transaction, User
from app.schemas import (
    MessageOut,
    TransactionCreate,
    TransactionListOut,
    TransactionOut,
    TransactionUpdate,
)
from app.services.transactions import list_transactions

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _validate_amount_for_kind(kind: str, amount) -> None:
    if kind in (CategoryKind.income.value, CategoryKind.expense.value) and amount < 0:
        raise HTTPException(
            status_code=400,
            detail=f"{kind} transaction amounts must be positive",
        )


@router.get("", response_model=TransactionListOut)
def search_transactions(
    q: str | None = Query(None, description="Search note, category, amount, date"),
    kind: CategoryKind | None = None,
    category_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort_by: str = Query("date", pattern="^(date|amount|category|kind|created_at)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionListOut:
    items, total = list_transactions(
        db,
        user,
        q=q,
        kind=kind,
        category_id=category_id,
        date_from=date_from,
        date_to=date_to,
        sort_by=sort_by,
        sort_dir=sort_dir,
        limit=limit,
        offset=offset,
    )
    return TransactionListOut(
        items=[TransactionOut.model_validate(i) for i in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    body: TransactionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    cat = db.scalar(
        select(Category).where(Category.id == body.category_id, Category.user_id == user.id)
    )
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.archived:
        raise HTTPException(status_code=400, detail="Cannot log against an archived category")
    _validate_amount_for_kind(cat.kind, body.amount)

    tx = Transaction(
        user_id=user.id,
        category_id=body.category_id,
        amount=body.amount,
        date=body.date,
        note=body.note,
    )
    db.add(tx)
    db.commit()
    tx = db.scalar(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(Transaction.id == tx.id)
    )
    return tx


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(
    transaction_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    tx = db.scalar(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(Transaction.id == transaction_id, Transaction.user_id == user.id)
    )
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx


@router.patch("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: UUID,
    body: TransactionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    tx = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.user_id == user.id
        )
    )
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    category_id = body.category_id or tx.category_id
    cat = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")

    amount = body.amount if body.amount is not None else tx.amount
    _validate_amount_for_kind(cat.kind, amount)

    tx.category_id = category_id
    tx.amount = amount
    if body.date is not None:
        tx.date = body.date
    if body.note is not None:
        tx.note = body.note
    db.add(tx)
    db.commit()
    return db.scalar(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(Transaction.id == tx.id)
    )


@router.delete("/{transaction_id}", response_model=MessageOut)
def delete_transaction(
    transaction_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    tx = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.user_id == user.id
        )
    )
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    return MessageOut(detail="Transaction deleted")
