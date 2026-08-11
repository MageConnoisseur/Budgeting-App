"""Budget month, annual grid, copy-forward, and template routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import BudgetMonth, BudgetTemplate, User
from app.schemas import (
    AnnualBudgetCell,
    AnnualBudgetOut,
    ApplyTemplateRequest,
    BudgetMonthOut,
    BudgetMonthUpsert,
    BudgetTemplateOut,
    CopyFromMonthRequest,
    MessageOut,
    SaveTemplateRequest,
)
from app.services import budget as budget_service

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _month_out(month: BudgetMonth, seeded_from: str | None = None) -> BudgetMonthOut:
    return BudgetMonthOut.model_validate(
        {
            **{c.name: getattr(month, c.name) for c in month.__table__.columns},
            "lines": month.lines,
            "seeded_from": seeded_from,
        }
    )


@router.get("/months/{year}/{month}", response_model=BudgetMonthOut)
def get_budget_month(
    year: int,
    month: int,
    seed: bool = Query(True, description="Auto-seed from prior month if new"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetMonthOut:
    bm, seeded_from = budget_service.get_or_create_month(
        db, user, year, month, auto_seed=seed
    )
    return _month_out(bm, seeded_from)


@router.put("/months/{year}/{month}", response_model=BudgetMonthOut)
def upsert_budget_month(
    year: int,
    month: int,
    body: BudgetMonthUpsert,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetMonthOut:
    bm = budget_service.upsert_month_lines(
        db,
        user,
        year,
        month,
        body.lines,
        replace_all=body.replace_all,
        auto_seed=False,
    )
    return _month_out(bm)


@router.get("/annual/{year}", response_model=AnnualBudgetOut)
def get_annual_budget(
    year: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnualBudgetOut:
    months = budget_service.get_annual_budget(db, user, year)
    return AnnualBudgetOut(year=year, months=[_month_out(m) for m in months])


@router.put("/annual/cell", response_model=BudgetMonthOut)
def upsert_annual_cell(
    body: AnnualBudgetCell,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetMonthOut:
    """Editable annual grid cell — creates/seeds the month when needed."""
    bm = budget_service.upsert_annual_cell(
        db, user, body.year, body.month, body.category_id, body.planned_amount
    )
    return _month_out(bm)


@router.post("/months/{year}/{month}/copy-from", response_model=BudgetMonthOut)
def copy_from_month(
    year: int,
    month: int,
    body: CopyFromMonthRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetMonthOut:
    bm = budget_service.copy_from_month(
        db, user, year, month, body.source_year, body.source_month
    )
    return _month_out(bm, seeded_from=f"{body.source_year:04d}-{body.source_month:02d}")


@router.post(
    "/templates/save",
    response_model=BudgetTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
def save_template(
    body: SaveTemplateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetTemplateOut:
    template = budget_service.save_as_template(
        db, user, body.name, body.year, body.month
    )
    return BudgetTemplateOut.model_validate(template)


@router.post("/months/{year}/{month}/apply-template", response_model=BudgetMonthOut)
def apply_template(
    year: int,
    month: int,
    body: ApplyTemplateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetMonthOut:
    budget_service.apply_template(db, user, year, month, body.template_id)
    bm, _ = budget_service.get_or_create_month(db, user, year, month, auto_seed=False)
    return _month_out(bm, seeded_from=f"template:{body.template_id}")


@router.get("/templates", response_model=list[BudgetTemplateOut])
def list_templates(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BudgetTemplate]:
    return list(
        db.scalars(
            select(BudgetTemplate)
            .options(joinedload(BudgetTemplate.lines))
            .where(BudgetTemplate.user_id == user.id)
            .order_by(BudgetTemplate.name)
        )
        .unique()
        .all()
    )


@router.get("/templates/{template_id}", response_model=BudgetTemplateOut)
def get_template(
    template_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetTemplate:
    template = db.scalar(
        select(BudgetTemplate)
        .options(joinedload(BudgetTemplate.lines))
        .where(BudgetTemplate.id == template_id, BudgetTemplate.user_id == user.id)
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.delete("/templates/{template_id}", response_model=MessageOut)
def delete_template(
    template_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    template = db.scalar(
        select(BudgetTemplate).where(
            BudgetTemplate.id == template_id, BudgetTemplate.user_id == user.id
        )
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()
    return MessageOut(detail="Template deleted")
