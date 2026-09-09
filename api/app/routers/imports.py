"""CSV statement import: preview, stage a date range, review inbox."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Transaction, User
from app.schemas import (
    ImportAcceptRequest,
    ImportBatchOut,
    ImportCandidateOut,
    ImportCategoryUpdate,
    ImportCommitOut,
    ImportInboxOut,
    ImportMatchedTransactionOut,
    ImportMergeRequest,
    ImportPreviewOut,
    ImportPreviewRowOut,
)
from app.services.imports import service as imports

router = APIRouter(prefix="/imports", tags=["imports"])


def _matched_out(tx: Transaction | None) -> ImportMatchedTransactionOut | None:
    if tx is None or tx.category is None:
        return None
    return ImportMatchedTransactionOut(
        id=tx.id,
        date=tx.date,
        amount=tx.amount,
        note=tx.note,
        category_id=tx.category_id,
        category_name=tx.category.name,
    )


def _candidate_out(row) -> ImportCandidateOut:
    return ImportCandidateOut(
        id=row.id,
        batch_id=row.batch_id,
        source=row.source,
        fingerprint=row.fingerprint,
        trans_date=row.trans_date,
        post_date=row.post_date,
        amount=row.amount,
        description=row.description,
        merchant_key=row.merchant_key,
        issuer_category=row.issuer_category,
        status=row.status,
        match_kind=row.match_kind,
        category_id=row.category_id,
        matched_transaction_id=row.matched_transaction_id,
        accepted_transaction_id=row.accepted_transaction_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        category=row.category,
        matched_transaction=_matched_out(row.matched_transaction),
    )


def _inbox_out(items: list) -> ImportInboxOut:
    return ImportInboxOut(
        items=[_candidate_out(row) for row in items],
        total=len(items),
    )


@router.post("/preview", response_model=ImportPreviewOut)
def preview_import(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportPreviewOut:
    _ = (user, db)
    filename, text = imports.read_csv_upload(file)
    parsed = imports.parse_csv_text(text, filename)
    preview = imports.preview_from_parse(parsed)
    return ImportPreviewOut(
        source=preview["source"],
        filename=filename,
        date_min=preview["date_min"],
        date_max=preview["date_max"],
        total_rows=preview["total_rows"],
        importable_count=preview["importable_count"],
        payment_count=preview["payment_count"],
        credit_count=preview["credit_count"],
        warnings=preview["warnings"],
        rows=[ImportPreviewRowOut.model_validate(r) for r in preview["rows"]],
    )


@router.post("", response_model=ImportCommitOut)
def commit_import(
    file: UploadFile = File(...),
    date_from: date = Form(...),
    date_to: date = Form(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportCommitOut:
    filename, text = imports.read_csv_upload(file)
    parsed = imports.parse_csv_text(text, filename)
    batch = imports.commit_import(
        db,
        user,
        filename=filename,
        parsed=parsed,
        date_from=date_from,
        date_to=date_to,
    )
    pending = imports.list_pending(db, user)
    return ImportCommitOut(
        batch=ImportBatchOut.model_validate(batch),
        inbox=_inbox_out(pending),
    )


@router.get("/inbox", response_model=ImportInboxOut)
def get_inbox(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportInboxOut:
    return _inbox_out(imports.list_pending(db, user))


@router.patch("/candidates/{candidate_id}", response_model=ImportCandidateOut)
def patch_candidate(
    candidate_id: UUID,
    body: ImportCategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportCandidateOut:
    row = imports.set_candidate_category(db, user, candidate_id, body.category_id)
    return _candidate_out(row)


@router.post("/candidates/{candidate_id}/accept", response_model=ImportCandidateOut)
def accept_candidate(
    candidate_id: UUID,
    body: ImportAcceptRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportCandidateOut:
    row = imports.accept_candidate(db, user, candidate_id, body.category_id)
    return _candidate_out(row)


@router.post("/candidates/{candidate_id}/skip", response_model=ImportCandidateOut)
def skip_candidate(
    candidate_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportCandidateOut:
    row = imports.skip_candidate(db, user, candidate_id)
    return _candidate_out(row)


@router.post("/candidates/{candidate_id}/merge", response_model=ImportCandidateOut)
def merge_candidate(
    candidate_id: UUID,
    body: ImportMergeRequest | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportCandidateOut:
    payload = body or ImportMergeRequest()
    row = imports.merge_candidate(
        db, user, candidate_id, transaction_id=payload.transaction_id
    )
    return _candidate_out(row)


@router.post("/candidates/{candidate_id}/keep-both", response_model=ImportCandidateOut)
def keep_both(
    candidate_id: UUID,
    body: ImportAcceptRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportCandidateOut:
    """Accept as a new expense even when a possible duplicate is flagged."""
    row = imports.accept_candidate(db, user, candidate_id, body.category_id)
    return _candidate_out(row)
