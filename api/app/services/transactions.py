"""Transaction query helpers: search, sort, filter, pagination."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from uuid import UUID, uuid4

from fastapi import HTTPException
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


def _load_tx(db: Session, user: User, tx_id: UUID) -> Transaction | None:
    return db.scalar(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(Transaction.id == tx_id, Transaction.user_id == user.id)
    )


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _savings_bucket(db: Session, user: User, category_id: UUID) -> Category:
    bucket = db.scalar(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == user.id,
        )
    )
    if bucket is None:
        raise HTTPException(status_code=404, detail="Savings bucket not found")
    if bucket.kind != CategoryKind.savings.value:
        raise HTTPException(
            status_code=400,
            detail="withdraw_from_category_id must be a savings category",
        )
    if bucket.archived:
        raise HTTPException(
            status_code=400, detail="Cannot withdraw from an archived bucket"
        )
    return bucket


def _cover_amount(expense_amount: Decimal, withdraw_amount: Decimal | None) -> Decimal:
    """Dollars of an expense to pull from a bucket. Omit to cover the full charge."""
    if expense_amount <= Decimal("0.00"):
        raise HTTPException(
            status_code=400,
            detail="Expense amount must be positive when withdrawing from savings",
        )
    cover = expense_amount if withdraw_amount is None else _money(withdraw_amount)
    if cover <= Decimal("0.00") or cover > _money(expense_amount):
        raise HTTPException(
            status_code=400,
            detail="Amount from savings must be greater than zero and no more than the expense",
        )
    return cover


def create_transaction(
    db: Session,
    user: User,
    *,
    category: Category,
    amount,
    date,
    note: str | None,
    withdraw_from_category_id: UUID | None = None,
    withdraw_amount: Decimal | None = None,
    import_fingerprint: str | None = None,
) -> Transaction:
    """Create a transaction, optionally pairing an expense with a savings withdrawal.

    ``withdraw_amount`` may be less than the expense. The rest stays on that
    month's paycheck. Omit it to withdraw the full expense amount.
    """
    pair_id = None
    withdrawal_cat = None
    cover = None
    if withdraw_from_category_id is not None or withdraw_amount is not None:
        if withdraw_from_category_id is None:
            raise HTTPException(
                status_code=400,
                detail="Choose a savings bucket to cover part of this expense",
            )
        if category.kind != CategoryKind.expense.value:
            raise HTTPException(
                status_code=400,
                detail="Only expenses can withdraw from a savings bucket",
            )
        withdrawal_cat = _savings_bucket(db, user, withdraw_from_category_id)
        cover = _cover_amount(amount, withdraw_amount)
        pair_id = uuid4()

    tx = Transaction(
        user_id=user.id,
        category_id=category.id,
        amount=amount,
        date=date,
        note=note,
        pair_id=pair_id,
        import_fingerprint=import_fingerprint,
    )
    db.add(tx)
    if withdrawal_cat is not None and pair_id is not None and cover is not None:
        db.add(
            Transaction(
                user_id=user.id,
                category_id=withdrawal_cat.id,
                amount=-cover,
                date=date,
                note=note,
                pair_id=pair_id,
            )
        )
    db.commit()
    loaded = _load_tx(db, user, tx.id)
    assert loaded is not None
    return loaded


def paired_sibling(db: Session, user: User, tx: Transaction) -> Transaction | None:
    if tx.pair_id is None:
        return None
    return db.scalar(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.pair_id == tx.pair_id,
            Transaction.id != tx.id,
        )
    )


def sync_pair_from(
    db: Session,
    user: User,
    tx: Transaction,
    *,
    previous_amount: Decimal | None = None,
) -> None:
    """Keep a paired expense and withdrawal on the same date and note.

    A partial cover stays put when the expense amount changes. A cover that
    matched the previous expense amount (the whole charge) follows the new
    amount, including CSV merges that replace a rounded figure. Editing the
    withdrawal itself changes only that cover, and cannot exceed the expense.
    """
    sibling = paired_sibling(db, user, tx)
    if sibling is None:
        return
    sib_cat = db.get(Category, sibling.category_id)
    tx_cat = tx.category if tx.category is not None else db.get(Category, tx.category_id)
    sibling.date = tx.date
    sibling.note = tx.note
    if (
        sib_cat is not None
        and sib_cat.kind == CategoryKind.savings.value
        and tx_cat is not None
        and tx_cat.kind == CategoryKind.expense.value
    ):
        new_expense = _money(abs(tx.amount))
        covered = _money(abs(sibling.amount))
        was_full = previous_amount is not None and covered == _money(abs(previous_amount))
        if was_full or covered > new_expense:
            sibling.amount = -new_expense
    elif (
        tx_cat is not None
        and tx_cat.kind == CategoryKind.savings.value
        and sib_cat is not None
        and sib_cat.kind == CategoryKind.expense.value
    ):
        if tx.amount >= Decimal("0.00"):
            raise HTTPException(
                status_code=400,
                detail="This savings entry covers an expense, so the amount has to stay negative",
            )
        if _money(abs(tx.amount)) > _money(sibling.amount):
            raise HTTPException(
                status_code=400,
                detail="Amount from savings cannot exceed the expense",
            )
    db.add(sibling)


def apply_expense_cover(
    db: Session,
    user: User,
    tx: Transaction,
    updates: dict,
) -> None:
    """Add, change, or remove the bucket cover on an expense."""
    if "withdraw_from_category_id" in updates and updates["withdraw_from_category_id"] is None:
        sibling = paired_sibling(db, user, tx)
        tx.pair_id = None
        db.add(tx)
        if sibling is not None:
            db.delete(sibling)
        return

    bucket_id = updates.get("withdraw_from_category_id")
    sibling = paired_sibling(db, user, tx)
    if bucket_id is None:
        if sibling is None:
            if updates.get("withdraw_amount") is not None:
                raise HTTPException(
                    status_code=400,
                    detail="Choose a savings bucket to cover part of this expense",
                )
            return
        sib_cat = db.get(Category, sibling.category_id)
        if sib_cat is None or sib_cat.kind != CategoryKind.savings.value:
            return
        bucket_id = sibling.category_id

    bucket = _savings_bucket(db, user, bucket_id)
    if "withdraw_amount" in updates and updates["withdraw_amount"] is not None:
        requested: Decimal | None = updates["withdraw_amount"]
    elif sibling is not None:
        requested = _money(abs(sibling.amount))
    else:
        requested = None
    cover = _cover_amount(tx.amount, requested)
    if tx.pair_id is None:
        tx.pair_id = uuid4()
    if sibling is None:
        db.add(
            Transaction(
                user_id=user.id,
                category_id=bucket.id,
                amount=-cover,
                date=tx.date,
                note=tx.note,
                pair_id=tx.pair_id,
            )
        )
    else:
        sibling.category_id = bucket.id
        sibling.amount = -cover
        sibling.date = tx.date
        sibling.note = tx.note
        sibling.pair_id = tx.pair_id
        db.add(sibling)
    db.add(tx)


@dataclass(frozen=True)
class ExpenseCover:
    amount: Decimal
    category_id: UUID
    category_name: str


def covers_for_expenses(
    db: Session, user: User, txs: list[Transaction]
) -> dict[UUID, ExpenseCover]:
    """Expense id → dollars withdrawn from the paired savings bucket."""
    pair_ids = {tx.pair_id for tx in txs if tx.pair_id is not None}
    if not pair_ids:
        return {}
    rows = (
        db.scalars(
            select(Transaction)
            .options(joinedload(Transaction.category))
            .where(
                Transaction.user_id == user.id,
                Transaction.pair_id.in_(pair_ids),
            )
        )
        .unique()
        .all()
    )
    grouped: dict[UUID, list[Transaction]] = {}
    for row in rows:
        if row.pair_id is None:
            continue
        grouped.setdefault(row.pair_id, []).append(row)
    covers: dict[UUID, ExpenseCover] = {}
    for group in grouped.values():
        expense = next(
            (
                row
                for row in group
                if row.category is not None
                and row.category.kind == CategoryKind.expense.value
                and row.amount > 0
            ),
            None,
        )
        withdrawal = next(
            (
                row
                for row in group
                if row.category is not None
                and row.category.kind == CategoryKind.savings.value
                and row.amount < 0
            ),
            None,
        )
        if expense is None or withdrawal is None or withdrawal.category is None:
            continue
        covered = min(_money(expense.amount), _money(abs(withdrawal.amount)))
        covers[expense.id] = ExpenseCover(
            amount=covered,
            category_id=withdrawal.category_id,
            category_name=withdrawal.category.name,
        )
    return covers


def delete_transaction_and_pair(db: Session, user: User, tx: Transaction) -> None:
    sibling = paired_sibling(db, user, tx)
    db.delete(tx)
    if sibling is not None:
        db.delete(sibling)
    db.commit()
