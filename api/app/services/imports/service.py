"""Import inbox: preview a CSV, stage a date range, accept / merge / skip."""

from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from fastapi import HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.enums import CategoryKind, ImportCandidateStatus, ImportMatchKind
from app.models import Category, ImportBatch, ImportCandidate, Transaction, User
from app.services.imports.matching import (
    TIGHT_DATE_WINDOW_DAYS,
    LedgerRow,
    assign_fuzzy_matches,
)
from app.services.imports.parsers import ParseError, ParseResult, ParsedRow, parse_statement
from app.services.transactions import sync_pair_from

MAX_CSV_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000


def suggest_category_id(
    _db: Session,
    _user: User,
    *,
    merchant_key: str,
    issuer_category: str | None,
) -> UUID | None:
    """Future hook: merchant rules, then note/category history.

    Returns None so first-time merchants never silently land in a budget
    category. Callers still persist ``merchant_key`` and ``issuer_category``
    so rules can be seeded later without a schema change.
    """
    _ = (merchant_key, issuer_category)
    return None


def read_csv_upload(file: UploadFile) -> tuple[str, str]:
    filename = (file.filename or "statement.csv").strip() or "statement.csv"
    if len(filename) > 255:
        filename = filename[:255]
    lower = filename.lower()
    if not (lower.endswith(".csv") or lower.endswith(".txt")):
        raise HTTPException(
            status_code=400,
            detail="Please upload a .csv statement file.",
        )
    raw = file.file.read(MAX_CSV_BYTES + 1)
    if not raw:
        raise HTTPException(status_code=400, detail="File is empty.")
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(
            status_code=400,
            detail="CSV is too large (max 2 MB).",
        )
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    return filename, text


def parse_csv_text(text: str, filename: str) -> ParseResult:
    try:
        result = parse_statement(text, filename=filename)
    except ParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if len(result.rows) > MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"CSV has too many rows (max {MAX_ROWS}).",
        )
    return result


def preview_from_parse(parsed: ParseResult) -> dict:
    importable = parsed.importable
    dates = [row.trans_date for row in importable]
    return {
        "source": parsed.source,
        "date_min": min(dates) if dates else None,
        "date_max": max(dates) if dates else None,
        "total_rows": len(parsed.rows),
        "importable_count": len(importable),
        "payment_count": len(parsed.payments),
        "credit_count": sum(1 for row in importable if row.amount < 0),
        "warnings": list(parsed.warnings),
        "rows": [
            {
                "trans_date": row.trans_date,
                "post_date": row.post_date,
                "amount": row.amount,
                "description": row.description,
                "issuer_category": row.issuer_category,
                "is_credit": row.amount < 0,
            }
            for row in importable
        ],
    }


def _known_fingerprints(db: Session, user: User) -> set[str]:
    cand = db.scalars(
        select(ImportCandidate.fingerprint).where(ImportCandidate.user_id == user.id)
    ).all()
    tx = db.scalars(
        select(Transaction.import_fingerprint).where(
            Transaction.user_id == user.id,
            Transaction.import_fingerprint.is_not(None),
        )
    ).all()
    return {fp for fp in [*cand, *tx] if fp}


def _expense_ledger(db: Session, user: User, start: date, end: date) -> list[LedgerRow]:
    rows = db.scalars(
        select(Transaction)
        .join(Category)
        .options(joinedload(Transaction.category))
        .where(
            Transaction.user_id == user.id,
            Category.kind == CategoryKind.expense.value,
            Transaction.date >= start,
            Transaction.date <= end,
        )
    ).unique().all()
    out: list[LedgerRow] = []
    for tx in rows:
        cat = tx.category
        if cat is None:
            continue
        out.append(
            LedgerRow(
                id=tx.id,
                date=tx.date,
                amount=tx.amount,
                note=tx.note,
                category_id=tx.category_id,
                category_name=cat.name,
            )
        )
    return out


def _apply_matches(db: Session, user: User, candidates: list[ImportCandidate]) -> None:
    pending = [c for c in candidates if c.status == ImportCandidateStatus.pending.value]
    if not pending:
        return
    start = min(c.trans_date for c in pending) - timedelta(days=TIGHT_DATE_WINDOW_DAYS)
    end = max(c.trans_date for c in pending) + timedelta(days=TIGHT_DATE_WINDOW_DAYS)
    ledger = _expense_ledger(db, user, start, end)
    payload = [(c, c.trans_date, c.amount, c.description) for c in pending]
    assigned = assign_fuzzy_matches(payload, ledger)
    for idx, cand in enumerate(pending):
        match = assigned.get(idx)
        if match is None:
            cand.matched_transaction_id = None
            cand.match_kind = ImportMatchKind.none.value
        else:
            cand.matched_transaction_id = match.transaction_id
            cand.match_kind = ImportMatchKind.fuzzy.value
        db.add(cand)


def commit_import(
    db: Session,
    user: User,
    *,
    filename: str,
    parsed: ParseResult,
    date_from: date,
    date_to: date,
) -> ImportBatch:
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="From date must be on or before To date.")

    known = _known_fingerprints(db, user)
    in_range: list[ParsedRow] = []
    out_of_range = 0
    for row in parsed.importable:
        if date_from <= row.trans_date <= date_to:
            in_range.append(row)
        else:
            out_of_range += 1

    new_rows = [row for row in in_range if row.fingerprint not in known]
    duplicate_count = len(in_range) - len(new_rows)

    batch = ImportBatch(
        user_id=user.id,
        source=parsed.source,
        filename=filename,
        date_from=date_from,
        date_to=date_to,
        imported_count=len(new_rows),
        skipped_payment_count=len(parsed.payments),
        skipped_duplicate_count=duplicate_count,
        skipped_out_of_range_count=out_of_range,
    )
    db.add(batch)
    db.flush()

    created: list[ImportCandidate] = []
    for row in new_rows:
        suggested = suggest_category_id(
            db,
            user,
            merchant_key=row.merchant_key,
            issuer_category=row.issuer_category,
        )
        cand = ImportCandidate(
            user_id=user.id,
            batch_id=batch.id,
            source=row.source,
            fingerprint=row.fingerprint,
            trans_date=row.trans_date,
            post_date=row.post_date,
            amount=row.amount,
            description=row.description,
            merchant_key=row.merchant_key,
            issuer_category=row.issuer_category,
            status=ImportCandidateStatus.pending.value,
            category_id=suggested,
            match_kind=ImportMatchKind.none.value,
        )
        db.add(cand)
        created.append(cand)
    db.flush()
    _apply_matches(db, user, created)
    db.commit()
    return db.scalar(select(ImportBatch).where(ImportBatch.id == batch.id))  # type: ignore[return-value]


def list_pending(db: Session, user: User) -> list[ImportCandidate]:
    items = list(
        db.scalars(
            select(ImportCandidate)
            .options(
                joinedload(ImportCandidate.category),
                joinedload(ImportCandidate.matched_transaction).joinedload(
                    Transaction.category
                ),
            )
            .where(
                ImportCandidate.user_id == user.id,
                ImportCandidate.status == ImportCandidateStatus.pending.value,
            )
            .order_by(ImportCandidate.trans_date.desc(), ImportCandidate.created_at.desc())
        )
        .unique()
        .all()
    )
    if items:
        _apply_matches(db, user, items)
        db.commit()
        items = list(
            db.scalars(
                select(ImportCandidate)
                .options(
                    joinedload(ImportCandidate.category),
                    joinedload(ImportCandidate.matched_transaction).joinedload(
                        Transaction.category
                    ),
                )
                .where(
                    ImportCandidate.user_id == user.id,
                    ImportCandidate.status == ImportCandidateStatus.pending.value,
                )
                .order_by(
                    ImportCandidate.trans_date.desc(), ImportCandidate.created_at.desc()
                )
            )
            .unique()
            .all()
        )
    return items


def pending_count(db: Session, user: User) -> int:
    return int(
        db.scalar(
            select(func.count()).where(
                ImportCandidate.user_id == user.id,
                ImportCandidate.status == ImportCandidateStatus.pending.value,
            )
        )
        or 0
    )


def _pending_candidate(db: Session, user: User, candidate_id: UUID) -> ImportCandidate:
    cand = db.scalar(
        select(ImportCandidate)
        .options(
            joinedload(ImportCandidate.category),
            joinedload(ImportCandidate.matched_transaction).joinedload(Transaction.category),
        )
        .where(
            ImportCandidate.id == candidate_id,
            ImportCandidate.user_id == user.id,
        )
    )
    if cand is None:
        raise HTTPException(status_code=404, detail="Import row not found")
    if cand.status != ImportCandidateStatus.pending.value:
        raise HTTPException(status_code=400, detail="That import row is already resolved")
    return cand


def _expense_category(db: Session, user: User, category_id: UUID) -> Category:
    cat = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.archived:
        raise HTTPException(status_code=400, detail="Cannot log against an archived category")
    if cat.kind != CategoryKind.expense.value:
        raise HTTPException(
            status_code=400,
            detail="Imported card charges must use an expense category",
        )
    return cat


def set_candidate_category(
    db: Session, user: User, candidate_id: UUID, category_id: UUID
) -> ImportCandidate:
    cand = _pending_candidate(db, user, candidate_id)
    _expense_category(db, user, category_id)
    cand.category_id = category_id
    db.add(cand)
    db.commit()
    return _pending_candidate(db, user, candidate_id)


def accept_candidate(
    db: Session, user: User, candidate_id: UUID, category_id: UUID
) -> ImportCandidate:
    cand = _pending_candidate(db, user, candidate_id)
    cat = _expense_category(db, user, category_id)
    note = cand.description[:2000]
    tx = Transaction(
        user_id=user.id,
        category_id=cat.id,
        amount=cand.amount,
        date=cand.trans_date,
        note=note,
        import_fingerprint=cand.fingerprint,
    )
    db.add(tx)
    db.flush()
    cand.status = ImportCandidateStatus.accepted.value
    cand.category_id = cat.id
    cand.accepted_transaction_id = tx.id
    db.add(cand)
    db.commit()
    return db.scalar(
        select(ImportCandidate)
        .options(joinedload(ImportCandidate.accepted_transaction))
        .where(ImportCandidate.id == cand.id)
    )  # type: ignore[return-value]


def skip_candidate(db: Session, user: User, candidate_id: UUID) -> ImportCandidate:
    cand = _pending_candidate(db, user, candidate_id)
    cand.status = ImportCandidateStatus.skipped.value
    db.add(cand)
    db.commit()
    return cand


def merge_candidate(
    db: Session,
    user: User,
    candidate_id: UUID,
    transaction_id: UUID | None = None,
) -> ImportCandidate:
    cand = _pending_candidate(db, user, candidate_id)
    target_id = transaction_id or cand.matched_transaction_id
    if target_id is None:
        raise HTTPException(
            status_code=400,
            detail="Pick a tracker entry to merge into, or keep both as a new expense.",
        )
    tx = db.scalar(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(Transaction.id == target_id, Transaction.user_id == user.id)
    )
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    cat = tx.category
    if cat is None or cat.kind != CategoryKind.expense.value:
        raise HTTPException(
            status_code=400,
            detail="Can only merge card charges into an expense tracker entry",
        )
    # Keep category, note, paid-from pair; replace rounded amount with posted.
    tx.amount = cand.amount
    if not (tx.note or "").strip():
        tx.note = cand.description[:2000]
    if tx.import_fingerprint and tx.import_fingerprint != cand.fingerprint:
        raise HTTPException(
            status_code=400,
            detail="That tracker entry is already linked to a different imported row",
        )
    tx.import_fingerprint = cand.fingerprint
    sync_pair_from(db, user, tx)
    cand.status = ImportCandidateStatus.merged.value
    cand.matched_transaction_id = tx.id
    cand.accepted_transaction_id = tx.id
    cand.category_id = tx.category_id
    db.add(tx)
    db.add(cand)
    db.commit()
    return db.scalar(
        select(ImportCandidate)
        .options(joinedload(ImportCandidate.accepted_transaction))
        .where(ImportCandidate.id == cand.id)
    )  # type: ignore[return-value]
