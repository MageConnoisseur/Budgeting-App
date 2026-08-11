"""Transaction query helpers: search, sort, filter, pagination."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import asc, cast, desc, func, or_, select
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.types import String

from app.enums import CategoryKind
from app.models import Category, Transaction, User

SORTABLE = {
    "date": Transaction.date,
    "amount": Transaction.amount,
    "category": Category.name,
    "kind": Category.kind,
    "created_at": Transaction.created_at,
}


def list_transactions(
    db: Session,
    user: User,
    *,
    q: str | None = None,
    kind: CategoryKind | None = None,
    category_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort_by: str = "date",
    sort_dir: str = "desc",
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Transaction], int]:
    stmt = (
        select(Transaction)
        .join(Category)
        .where(Transaction.user_id == user.id)
        .options(joinedload(Transaction.category))
    )

    if kind is not None:
        stmt = stmt.where(Category.kind == kind.value)
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    if date_from is not None:
        stmt = stmt.where(Transaction.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Transaction.date <= date_to)

    if q:
        term = f"%{q.strip()}%"
        amount_match = None
        try:
            # Allow searching exact/partial amount strings like "12.50"
            cleaned = q.strip().replace("$", "").replace(",", "")
            amount_val = Decimal(cleaned).quantize(Decimal("0.01"))
            amount_match = Transaction.amount == amount_val
        except (InvalidOperation, ValueError):
            amount_match = None

        clauses = [
            Transaction.note.ilike(term),
            Category.name.ilike(term),
            cast(Transaction.date, String).ilike(term),
            cast(Transaction.amount, String).ilike(term),
        ]
        if amount_match is not None:
            clauses.append(amount_match)
        stmt = stmt.where(or_(*clauses))

    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = db.scalar(count_stmt) or 0

    col = SORTABLE.get(sort_by, Transaction.date)
    order = desc(col) if sort_dir.lower() != "asc" else asc(col)
    # Stable secondary sort
    stmt = stmt.order_by(order, desc(Transaction.created_at))
    items = db.scalars(stmt.limit(limit).offset(offset)).unique().all()
    return list(items), int(total)
