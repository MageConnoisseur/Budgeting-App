"""Category CRUD routes."""

from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.enums import CategoryKind
from app.models import Category, Transaction, User
from app.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.services.funding import clear_paid_from_links, is_savings_bucket

router = APIRouter(prefix="/categories", tags=["categories"])

ZERO = Decimal("0.00")
MONEY = Decimal("0.01")


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def _target_for_kind(
    kind: CategoryKind | str,
    target: Decimal | None,
    *,
    is_bucket: bool,
) -> Decimal | None:
    """Only savings buckets may carry a target amount."""
    kind_val = kind.value if isinstance(kind, CategoryKind) else kind
    if target is None:
        return None
    if kind_val != CategoryKind.savings.value:
        raise HTTPException(
            status_code=400,
            detail="target_amount is only allowed on savings categories",
        )
    if not is_bucket:
        raise HTTPException(
            status_code=400,
            detail="target_amount is only allowed on savings buckets",
        )
    return target


def _is_bucket_for_kind(kind: CategoryKind | str, is_bucket: bool) -> bool:
    kind_val = kind.value if isinstance(kind, CategoryKind) else kind
    if kind_val != CategoryKind.savings.value:
        if not is_bucket:
            raise HTTPException(
                status_code=400,
                detail="is_bucket is only meaningful for savings categories",
            )
        return True
    return is_bucket


def _paid_toward_map(
    db: Session, user_id: UUID, cats: list[Category]
) -> dict[UUID, Decimal]:
    ids = [c.id for c in cats if c.kind == CategoryKind.savings.value]
    if not ids:
        return {}
    rows = db.execute(
        select(
            Transaction.category_id,
            func.coalesce(func.sum(Transaction.amount), ZERO),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.category_id.in_(ids),
        )
        .group_by(Transaction.category_id)
    ).all()
    return {cid: _money(total) for cid, total in rows}


def _to_out(cat: Category, paid_toward: Decimal | None = None) -> CategoryOut:
    paid = None
    if cat.kind == CategoryKind.savings.value:
        paid = ZERO if paid_toward is None else _money(paid_toward)
    return CategoryOut.model_validate(cat).model_copy(update={"paid_toward": paid})


@router.get("", response_model=list[CategoryOut])
def list_categories(
    kind: CategoryKind | None = None,
    include_archived: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CategoryOut]:
    stmt = select(Category).where(Category.user_id == user.id)
    if kind is not None:
        stmt = stmt.where(Category.kind == kind.value)
    if not include_archived:
        stmt = stmt.where(Category.archived.is_(False))
    stmt = stmt.order_by(Category.kind, Category.sort_order, Category.name)
    cats = list(db.scalars(stmt).all())
    paid = _paid_toward_map(db, user.id, cats)
    return [_to_out(c, paid.get(c.id, ZERO)) for c in cats]


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    body: CategoryCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CategoryOut:
    is_bucket = _is_bucket_for_kind(body.kind, body.is_bucket)
    target = _target_for_kind(body.kind, body.target_amount, is_bucket=is_bucket)
    cat = Category(
        user_id=user.id,
        kind=body.kind.value,
        name=body.name.strip(),
        sort_order=body.sort_order,
        target_amount=target,
        is_bucket=is_bucket,
    )
    db.add(cat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400, detail="A category with this name and kind already exists"
        ) from None
    db.refresh(cat)
    return _to_out(cat, ZERO)


@router.get("/{category_id}", response_model=CategoryOut)
def get_category(
    category_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CategoryOut:
    cat = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    paid = _paid_toward_map(db, user.id, [cat])
    return _to_out(cat, paid.get(cat.id, ZERO))


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: UUID,
    body: CategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CategoryOut:
    cat = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.name is not None:
        cat.name = body.name.strip()
    if body.archived is not None:
        cat.archived = body.archived
    if body.sort_order is not None:
        cat.sort_order = body.sort_order
    if body.is_bucket is not None:
        next_bucket = _is_bucket_for_kind(cat.kind, body.is_bucket)
        if is_savings_bucket(cat) and not next_bucket:
            clear_paid_from_links(db, cat.id)
            cat.target_amount = None
        cat.is_bucket = next_bucket
    if "target_amount" in body.model_fields_set:
        cat.target_amount = _target_for_kind(
            cat.kind, body.target_amount, is_bucket=cat.is_bucket
        )
    db.add(cat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400, detail="A category with this name and kind already exists"
        ) from None
    db.refresh(cat)
    paid = _paid_toward_map(db, user.id, [cat])
    return _to_out(cat, paid.get(cat.id, ZERO))


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Soft-delete by archiving. Hard delete is avoided so history stays intact."""
    cat = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.archived = True
    db.add(cat)
    db.commit()
