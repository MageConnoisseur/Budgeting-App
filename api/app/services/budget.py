"""Budget plan helpers: copy-forward, templates, annual cells."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    BudgetLine,
    BudgetMonth,
    BudgetTemplate,
    BudgetTemplateLine,
    Category,
    User,
)
from app.schemas import BudgetLineUpsert


def _period_key(year: int, month: int) -> int:
    return year * 12 + month


def get_or_create_month(
    db: Session,
    user: User,
    year: int,
    month: int,
    *,
    auto_seed: bool = True,
) -> tuple[BudgetMonth, str | None]:
    """Return budget month, creating + optionally copy-forward seeding if missing.

    Returns (month, seeded_from_label).
    """
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be 1-12")

    existing = db.scalar(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines).joinedload(BudgetLine.category))
        .where(
            BudgetMonth.user_id == user.id,
            BudgetMonth.year == year,
            BudgetMonth.month == month,
        )
    )
    if existing is not None:
        return existing, None

    budget_month = BudgetMonth(user_id=user.id, year=year, month=month)
    db.add(budget_month)
    db.flush()

    seeded_from: str | None = None
    if auto_seed:
        prior = _find_most_recent_prior_month(db, user.id, year, month)
        if prior is not None:
            _copy_lines(db, source=prior, target=budget_month)
            seeded_from = f"{prior.year:04d}-{prior.month:02d}"

    db.commit()
    db.refresh(budget_month)
    return (
        db.scalar(
            select(BudgetMonth)
            .options(joinedload(BudgetMonth.lines).joinedload(BudgetLine.category))
            .where(BudgetMonth.id == budget_month.id)
        ),
        seeded_from,
    )


def _find_most_recent_prior_month(
    db: Session, user_id: UUID, year: int, month: int
) -> BudgetMonth | None:
    target = _period_key(year, month)
    months = db.scalars(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines))
        .where(BudgetMonth.user_id == user_id)
    ).unique().all()
    priors = [
        m
        for m in months
        if _period_key(m.year, m.month) < target and len(m.lines) > 0
    ]
    if not priors:
        return None
    return max(priors, key=lambda m: _period_key(m.year, m.month))


def _copy_lines(db: Session, *, source: BudgetMonth, target: BudgetMonth) -> None:
    """Copy planned amounts only — never transactions."""
    # Clear existing target lines
    for line in list(target.lines):
        db.delete(line)
    db.flush()

    for src in source.lines:
        # Skip archived categories
        cat = db.get(Category, src.category_id)
        if cat is None or cat.archived:
            continue
        db.add(
            BudgetLine(
                budget_month_id=target.id,
                category_id=src.category_id,
                planned_amount=src.planned_amount,
            )
        )
    db.flush()


def upsert_month_lines(
    db: Session,
    user: User,
    year: int,
    month: int,
    lines: list[BudgetLineUpsert],
    *,
    replace_all: bool = False,
    auto_seed: bool = False,
) -> BudgetMonth:
    budget_month, _ = get_or_create_month(db, user, year, month, auto_seed=auto_seed)
    # Re-fetch without auto-seed path for mutation
    budget_month = db.scalar(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines))
        .where(BudgetMonth.id == budget_month.id)
    )
    assert budget_month is not None

    existing_by_cat = {line.category_id: line for line in budget_month.lines}
    seen: set[UUID] = set()

    for item in lines:
        cat = db.scalar(
            select(Category).where(Category.id == item.category_id, Category.user_id == user.id)
        )
        if cat is None:
            raise HTTPException(status_code=404, detail=f"Category {item.category_id} not found")
        seen.add(item.category_id)
        if item.category_id in existing_by_cat:
            existing_by_cat[item.category_id].planned_amount = item.planned_amount
        else:
            db.add(
                BudgetLine(
                    budget_month_id=budget_month.id,
                    category_id=item.category_id,
                    planned_amount=item.planned_amount,
                )
            )

    if replace_all:
        for cat_id, line in existing_by_cat.items():
            if cat_id not in seen:
                db.delete(line)

    db.commit()
    return db.scalar(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines).joinedload(BudgetLine.category))
        .where(BudgetMonth.id == budget_month.id)
    )


def copy_from_month(
    db: Session,
    user: User,
    target_year: int,
    target_month: int,
    source_year: int,
    source_month: int,
) -> BudgetMonth:
    source = db.scalar(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines))
        .where(
            BudgetMonth.user_id == user.id,
            BudgetMonth.year == source_year,
            BudgetMonth.month == source_month,
        )
    )
    if source is None:
        raise HTTPException(status_code=404, detail="Source budget month not found")

    target, _ = get_or_create_month(db, user, target_year, target_month, auto_seed=False)
    target = db.scalar(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines))
        .where(BudgetMonth.id == target.id)
    )
    assert target is not None
    _copy_lines(db, source=source, target=target)
    db.commit()
    return db.scalar(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines).joinedload(BudgetLine.category))
        .where(BudgetMonth.id == target.id)
    )


def save_as_template(
    db: Session, user: User, name: str, year: int, month: int
) -> BudgetTemplate:
    source = db.scalar(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines))
        .where(
            BudgetMonth.user_id == user.id,
            BudgetMonth.year == year,
            BudgetMonth.month == month,
        )
    )
    if source is None:
        raise HTTPException(status_code=404, detail="Budget month not found")

    existing = db.scalar(
        select(BudgetTemplate)
        .options(joinedload(BudgetTemplate.lines))
        .where(BudgetTemplate.user_id == user.id, BudgetTemplate.name == name)
    )
    if existing:
        for line in list(existing.lines):
            db.delete(line)
        db.flush()
        template = existing
    else:
        template = BudgetTemplate(user_id=user.id, name=name)
        db.add(template)
        db.flush()

    for src in source.lines:
        db.add(
            BudgetTemplateLine(
                template_id=template.id,
                category_id=src.category_id,
                planned_amount=src.planned_amount,
            )
        )
    db.commit()
    return db.scalar(
        select(BudgetTemplate)
        .options(joinedload(BudgetTemplate.lines))
        .where(BudgetTemplate.id == template.id)
    )


def apply_template(
    db: Session, user: User, year: int, month: int, template_id: UUID
) -> BudgetTemplate:
    template = db.scalar(
        select(BudgetTemplate)
        .options(joinedload(BudgetTemplate.lines))
        .where(BudgetTemplate.id == template_id, BudgetTemplate.user_id == user.id)
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    target, _ = get_or_create_month(db, user, year, month, auto_seed=False)
    target = db.scalar(
        select(BudgetMonth)
        .options(joinedload(BudgetMonth.lines))
        .where(BudgetMonth.id == target.id)
    )
    assert target is not None

    for line in list(target.lines):
        db.delete(line)
    db.flush()

    for src in template.lines:
        cat = db.get(Category, src.category_id)
        if cat is None or cat.archived or cat.user_id != user.id:
            continue
        db.add(
            BudgetLine(
                budget_month_id=target.id,
                category_id=src.category_id,
                planned_amount=src.planned_amount,
            )
        )
    db.commit()
    return template


def get_annual_budget(db: Session, user: User, year: int) -> list[BudgetMonth]:
    """Return all months for a year that exist; does not auto-create all 12."""
    months = (
        db.scalars(
            select(BudgetMonth)
            .options(joinedload(BudgetMonth.lines).joinedload(BudgetLine.category))
            .where(BudgetMonth.user_id == user.id, BudgetMonth.year == year)
            .order_by(BudgetMonth.month)
        )
        .unique()
        .all()
    )
    return list(months)


def upsert_annual_cell(
    db: Session,
    user: User,
    year: int,
    month: int,
    category_id: UUID,
    planned_amount: Decimal,
) -> BudgetMonth:
    """Edit one annual-grid cell; creates/seeds the month if needed."""
    return upsert_month_lines(
        db,
        user,
        year,
        month,
        [BudgetLineUpsert(category_id=category_id, planned_amount=planned_amount)],
        replace_all=False,
        auto_seed=True,
    )
