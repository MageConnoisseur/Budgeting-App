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
    NoteSuggestionListOut,
    NoteSuggestionOut,
    TransactionCreate,
    TransactionListOut,
    TransactionOut,
    TransactionUpdate,
)
from app.services.transactions import (
    create_transaction as create_ledger_transaction,
    delete_transaction_and_pair,
    list_transactions,
    paired_sibling,
    suggest_notes,
    sync_pair_from,
)

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
    limit: int = Query(50, ge=1, le=500),
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


@router.get("/note-suggestions", response_model=NoteSuggestionListOut)
def note_suggestions(
    q: str | None = Query(None, description="Filter notes by prefix/substring"),
    category_id: UUID | None = Query(
        None, description="Prefer notes previously used with this category"
    ),
    limit: int = Query(10, ge=1, le=25),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NoteSuggestionListOut:
    if category_id is not None:
        cat = db.scalar(
            select(Category).where(Category.id == category_id, Category.user_id == user.id)
        )
        if cat is None:
            raise HTTPException(status_code=404, detail="Category not found")

    items = suggest_notes(
        db,
        user,
        q=q,
        category_id=category_id,
        limit=limit,
    )
    return NoteSuggestionListOut(
        items=[
            NoteSuggestionOut(
                note=i.note,
                use_count=i.use_count,
                last_date=i.last_date,
                last_amount=i.last_amount,
                last_category_id=i.last_category_id,
                last_category_name=i.last_category_name,
                last_kind=CategoryKind(i.last_kind),
            )
            for i in items
        ]
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

    return create_ledger_transaction(
        db,
        user,
        category=cat,
        amount=body.amount,
        date=body.date,
        note=body.note,
        withdraw_from_category_id=body.withdraw_from_category_id,
    )


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

    updates = body.model_dump(exclude_unset=True)
    category_id = updates.get("category_id", tx.category_id)
    cat = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")

    amount = updates.get("amount", tx.amount)
    _validate_amount_for_kind(cat.kind, amount)

    original_category_id = tx.category_id
    tx.category_id = category_id
    tx.amount = amount
    if "date" in updates:
        tx.date = updates["date"]
    if "note" in updates:
        tx.note = updates["note"]
    db.add(tx)
    if "category_id" in updates and category_id != original_category_id:
        sibling = paired_sibling(db, user, tx)
        tx.pair_id = None
        if sibling is not None:
            sibling.pair_id = None
            db.add(sibling)
    else:
        sync_pair_from(db, user, tx)
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
    delete_transaction_and_pair(db, user, tx)
    return MessageOut(detail="Transaction deleted")
