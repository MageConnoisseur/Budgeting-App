"""Discover CSV parser, fingerprints, and fuzzy-match windows (no database)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services.imports.fingerprints import (
    merchant_key,
    merchant_keys_related,
    row_fingerprint,
)
from app.services.imports.matching import LedgerRow, assign_fuzzy_matches, score_match
from app.services.imports.parsers import is_card_payment, parse_discover, parse_statement

SAMPLE = """Trans. Date,Post Date,Description,Amount,Category
08/02/2026,08/03/2026,COSTCO WHSE #123,42.18,Supermarkets
08/05/2026,08/06/2026,STARBUCKS STORE 123,5.65,Restaurants
08/10/2026,08/10/2026,INTERNET PAYMENT - THANK YOU,-500.00,Payments and Credits
08/15/2026,08/16/2026,AMAZON.COM*REFUND,-20.00,Merchandise
08/20/2026,08/21/2026,SHELL OIL 123,38.40,Gasoline
08/28/2026,08/29/2026,TRADER JOE'S #456,55.10,Supermarkets
"""


def test_parse_discover_skips_payments_keeps_refunds() -> None:
    parsed = parse_discover(SAMPLE, filename="Discover-Statement-20260903.csv")
    assert parsed.source == "discover"
    payments = [r for r in parsed.rows if r.is_payment]
    importable = list(parsed.importable)
    assert len(payments) == 1
    assert "INTERNET PAYMENT" in payments[0].description
    assert [r.description for r in importable] == [
        "COSTCO WHSE #123",
        "STARBUCKS STORE 123",
        "AMAZON.COM*REFUND",
        "SHELL OIL 123",
        "TRADER JOE'S #456",
    ]
    amazon = next(r for r in importable if "AMAZON" in r.description)
    assert amazon.amount == Decimal("-20.00")
    assert amazon.is_payment is False


def test_detect_from_filename_and_headers() -> None:
    parsed = parse_statement(SAMPLE, filename="Discover-Statement-20260903.csv")
    assert parsed.source == "discover"
    dates = [r.trans_date for r in parsed.importable]
    assert min(dates) == date(2026, 8, 2)
    assert max(dates) == date(2026, 8, 28)


def test_fingerprint_stable_and_changes_with_amount() -> None:
    a = row_fingerprint(
        source="discover",
        account_key="discover",
        trans_date=date(2026, 8, 2),
        amount=Decimal("42.18"),
        description="COSTCO WHSE #123",
    )
    b = row_fingerprint(
        source="discover",
        account_key="discover",
        trans_date=date(2026, 8, 2),
        amount=Decimal("42.18"),
        description="costco whse #123",
    )
    c = row_fingerprint(
        source="discover",
        account_key="discover",
        trans_date=date(2026, 8, 2),
        amount=Decimal("42.00"),
        description="COSTCO WHSE #123",
    )
    assert a == b
    assert a != c
    assert merchant_key("COSTCO WHSE #123") == "COSTCO WHSE"


def test_merchant_keys_related_same_chain() -> None:
    assert merchant_keys_related("COSTCO WHSE", "COSTCO WHSE")
    assert merchant_keys_related("COSTCO", "COSTCO WHSE")
    assert merchant_keys_related("SHELL", "SHELL OIL 123")
    assert merchant_keys_related("AMAZON", "AMAZON.COM*REFUND")
    assert not merchant_keys_related("COSTCO WHSE", "COSTCO GAS")
    assert not merchant_keys_related("BP", "BP STATION 12")
    assert not merchant_keys_related("", "COSTCO")


def test_issuer_label_matches_user_category_names() -> None:
    from app.services.imports.labels import (
        best_category_for_issuer_label,
        issuer_label_matches_category,
    )

    assert issuer_label_matches_category("Supermarkets", "Groceries")
    assert issuer_label_matches_category("Gasoline", "Gas")
    assert issuer_label_matches_category("Fuel", "Gas")
    assert issuer_label_matches_category("Restaurants", "Dining")
    assert not issuer_label_matches_category("Merchandise", "Groceries")
    assert not issuer_label_matches_category("Supermarkets", "Household")

    groceries = uuid4()
    household = uuid4()
    assert (
        best_category_for_issuer_label(
            "Supermarkets",
            [(household, "Household"), (groceries, "Groceries")],
        )
        == groceries
    )
    assert (
        best_category_for_issuer_label(
            "Merchandise",
            [(groceries, "Groceries")],
        )
        is None
    )


def test_payment_detector() -> None:
    assert is_card_payment("INTERNET PAYMENT - THANK YOU", "Payments and Credits")
    assert is_card_payment("AUTOMATIC PAYMENT", None)
    assert not is_card_payment("AMAZON.COM*REFUND", "Merchandise")
    assert not is_card_payment("COSTCO WHSE #1", "Supermarkets")


def test_fuzzy_match_rounding_and_date_window() -> None:
    tx_id = uuid4()
    cat_id = uuid4()
    ledger = [
        LedgerRow(
            id=tx_id,
            date=date(2026, 8, 1),
            amount=Decimal("42.00"),
            note="Costco",
            category_id=cat_id,
            category_name="Groceries",
        )
    ]
    scored = score_match(
        trans_date=date(2026, 8, 2),
        amount=Decimal("42.18"),
        description="COSTCO WHSE #123",
        tx=ledger[0],
    )
    assert scored is not None
    too_far = score_match(
        trans_date=date(2026, 8, 10),
        amount=Decimal("42.18"),
        description="COSTCO WHSE #123",
        tx=ledger[0],
    )
    assert too_far is None
    too_much = score_match(
        trans_date=date(2026, 8, 2),
        amount=Decimal("50.00"),
        description="COSTCO WHSE #123",
        tx=ledger[0],
    )
    assert too_much is None


def test_two_similar_purchases_are_not_both_matched_to_one_row() -> None:
    tx_id = uuid4()
    cat_id = uuid4()
    ledger = [
        LedgerRow(
            id=tx_id,
            date=date(2026, 8, 5),
            amount=Decimal("6.00"),
            note="Coffee",
            category_id=cat_id,
            category_name="Dining",
        )
    ]
    candidates = [
        (None, date(2026, 8, 5), Decimal("5.65"), "STARBUCKS STORE 123"),
        (None, date(2026, 8, 5), Decimal("5.80"), "DUNKIN #9"),
    ]
    assigned = assign_fuzzy_matches(candidates, ledger)
    assert len(assigned) == 1
