"""Transaction query helpers: search, sort, filter, pagination."""

from __future__ import annotations

from dataclasses import dataclass
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


@dataclass(frozen=True)
class NoteSuggestion:
    note: str
    use_count: int
    last_date: date
    last_amount: Decimal
    last_category_id: UUID
    last_category_name: str
    last_kind: str


def suggest_notes(
    db: Session,
    user: User,
    *,
    q: str | None = None,
    category_id: UUID | None = None,
    limit: int = 10,
) -> list[NoteSuggestion]:
    """Return distinct past notes ranked by frequency then recency.

    Notes are grouped by lowercased trimmed text so " Rent " and "rent" collapse.
    Display casing comes from the most recent matching transaction.
    """
    limit = max(1, min(limit, 25))
    needle = (q or "").strip().lower()
    note_key = func.lower(func.trim(Transaction.note))

    filters = [
        Transaction.user_id == user.id,
        Transaction.note.is_not(None),
        func.trim(Transaction.note) != "",
    ]
    if needle:
        # Prefix after 1 character; substring once the user types more.
        if len(needle) == 1:
            filters.append(note_key.like(f"{needle}%"))
        else:
            filters.append(note_key.like(f"%{needle}%"))

    ranked = (
        select(
            note_key.label("note_key"),
            func.count().label("use_count"),
            func.max(Transaction.date).label("last_date"),
            func.max(Transaction.created_at).label("last_created"),
        )
        .where(*filters)
        .group_by(note_key)
        .subquery()
    )

    latest = (
        select(
            Transaction.note,
            Transaction.amount,
            Transaction.date,
            Transaction.category_id,
            Category.name.label("category_name"),
            Category.kind.label("kind"),
            note_key.label("note_key"),
            func.row_number()
            .over(
                partition_by=note_key,
                order_by=(desc(Transaction.date), desc(Transaction.created_at)),
            )
            .label("rn"),
        )
        .join(Category, Category.id == Transaction.category_id)
        .where(*filters)
        .subquery()
    )
    pick = select(latest).where(latest.c.rn == 1).subquery()

    if category_id is not None:
        cat_counts = (
            select(
                note_key.label("note_key"),
                func.count().label("cat_use_count"),
            )
            .where(
                Transaction.user_id == user.id,
                Transaction.category_id == category_id,
                Transaction.note.is_not(None),
                func.trim(Transaction.note) != "",
            )
            .group_by(note_key)
            .subquery()
        )
        stmt = (
            select(
                pick.c.note,
                ranked.c.use_count,
                ranked.c.last_date,
                pick.c.amount,
                pick.c.category_id,
                pick.c.category_name,
                pick.c.kind,
            )
            .select_from(ranked)
            .join(pick, pick.c.note_key == ranked.c.note_key)
            .outerjoin(cat_counts, cat_counts.c.note_key == ranked.c.note_key)
            .order_by(
                desc(func.coalesce(cat_counts.c.cat_use_count, 0)),
                desc(ranked.c.use_count),
                desc(ranked.c.last_date),
                desc(ranked.c.last_created),
            )
            .limit(limit)
        )
    else:
        stmt = (
            select(
                pick.c.note,
                ranked.c.use_count,
                ranked.c.last_date,
                pick.c.amount,
                pick.c.category_id,
                pick.c.category_name,
                pick.c.kind,
            )
            .select_from(ranked)
            .join(pick, pick.c.note_key == ranked.c.note_key)
            .order_by(
                desc(ranked.c.use_count),
                desc(ranked.c.last_date),
                desc(ranked.c.last_created),
            )
            .limit(limit)
        )

    rows = db.execute(stmt).all()
    out: list[NoteSuggestion] = []
    for row in rows:
        note = (row.note or "").strip()
        if not note:
            continue
        out.append(
            NoteSuggestion(
                note=note,
                use_count=int(row.use_count),
                last_date=row.last_date,
                last_amount=row.amount,
                last_category_id=row.category_id,
                last_category_name=row.category_name,
                last_kind=row.kind,
            )
        )
    return out


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
