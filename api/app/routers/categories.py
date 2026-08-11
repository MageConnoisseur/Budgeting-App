"""Category CRUD routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.enums import CategoryKind
from app.models import Category, User
from app.schemas import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(
    kind: CategoryKind | None = None,
    include_archived: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Category]:
    stmt = select(Category).where(Category.user_id == user.id)
    if kind is not None:
        stmt = stmt.where(Category.kind == kind.value)
    if not include_archived:
        stmt = stmt.where(Category.archived.is_(False))
    stmt = stmt.order_by(Category.kind, Category.sort_order, Category.name)
    return list(db.scalars(stmt).all())


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    body: CategoryCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Category:
    cat = Category(
        user_id=user.id,
        kind=body.kind.value,
        name=body.name.strip(),
        sort_order=body.sort_order,
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
    return cat


@router.get("/{category_id}", response_model=CategoryOut)
def get_category(
    category_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Category:
    cat = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: UUID,
    body: CategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Category:
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
    db.add(cat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400, detail="A category with this name and kind already exists"
        ) from None
    db.refresh(cat)
    return cat


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
