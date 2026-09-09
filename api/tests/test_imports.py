"""CSV import inbox API: date range, payments skip, accept / merge / skip."""

from __future__ import annotations

import uuid
from decimal import Decimal
from io import BytesIO

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CSV = b"""Trans. Date,Post Date,Description,Amount,Category
08/02/2026,08/03/2026,COSTCO WHSE #123,42.18,Supermarkets
08/05/2026,08/06/2026,STARBUCKS STORE 123,5.65,Restaurants
08/10/2026,08/10/2026,INTERNET PAYMENT - THANK YOU,-500.00,Payments and Credits
08/15/2026,08/16/2026,AMAZON.COM*REFUND,-20.00,Merchandise
08/20/2026,08/21/2026,SHELL OIL 123,38.40,Gasoline
08/28/2026,08/29/2026,TRADER JOE'S #456,55.10,Supermarkets
"""


@pytest.fixture
def auth_headers() -> dict[str, str]:
    username = f"imp_{uuid.uuid4().hex[:10]}"
    password = "testpass123"
    email = f"{username}@example.com"
    r = client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _csv_file() -> dict:
    return {"file": ("Discover-Statement-20260903.csv", BytesIO(CSV), "text/csv")}


def test_preview_and_date_range_commit(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    preview = client.post("/api/imports/preview", headers=h, files=_csv_file())
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["source"] == "discover"
    assert body["date_min"] == "2026-08-02"
    assert body["date_max"] == "2026-08-28"
    assert body["payment_count"] == 1
    assert body["importable_count"] == 5
    assert body["credit_count"] == 1
    assert all("INTERNET PAYMENT" not in row["description"] for row in body["rows"])

    committed = client.post(
        "/api/imports",
        headers=h,
        files=_csv_file(),
        data={"date_from": "2026-08-01", "date_to": "2026-08-10"},
    )
    assert committed.status_code == 200, committed.text
    payload = committed.json()
    assert payload["batch"]["imported_count"] == 2
    assert payload["batch"]["skipped_payment_count"] == 1
    assert payload["batch"]["skipped_out_of_range_count"] == 3
    descriptions = {row["description"] for row in payload["inbox"]["items"]}
    assert descriptions == {"COSTCO WHSE #123", "STARBUCKS STORE 123"}


def test_accept_skip_and_fingerprint_dedup(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    groceries = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Groceries"},
    ).json()

    client.post(
        "/api/imports",
        headers=h,
        files=_csv_file(),
        data={"date_from": "2026-08-01", "date_to": "2026-08-31"},
    )
    inbox = client.get("/api/imports/inbox", headers=h).json()["items"]
    costco = next(i for i in inbox if i["description"].startswith("COSTCO"))
    starbucks = next(i for i in inbox if i["description"].startswith("STARBUCKS"))

    accepted = client.post(
        f"/api/imports/candidates/{costco['id']}/accept",
        headers=h,
        json={"category_id": groceries["id"]},
    )
    assert accepted.status_code == 200, accepted.text
    txs = client.get("/api/transactions", headers=h).json()["items"]
    assert any(
        t["note"] == "COSTCO WHSE #123" and Decimal(t["amount"]) == Decimal("42.18")
        for t in txs
    )

    skipped = client.post(
        f"/api/imports/candidates/{starbucks['id']}/skip",
        headers=h,
    )
    assert skipped.status_code == 200

    again = client.post(
        "/api/imports",
        headers=h,
        files=_csv_file(),
        data={"date_from": "2026-08-01", "date_to": "2026-08-31"},
    )
    assert again.status_code == 200, again.text
    remaining = {i["description"] for i in again.json()["inbox"]["items"]}
    assert "COSTCO WHSE #123" not in remaining
    assert "STARBUCKS STORE 123" not in remaining
    assert "SHELL OIL 123" in remaining


def test_fuzzy_merge_replaces_rounded_amount(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    groceries = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Groceries"},
    ).json()
    manual = client.post(
        "/api/transactions",
        headers=h,
        json={
            "category_id": groceries["id"],
            "amount": "42.00",
            "date": "2026-08-01",
            "note": "Costco",
        },
    )
    assert manual.status_code == 201, manual.text
    manual_id = manual.json()["id"]

    client.post(
        "/api/imports",
        headers=h,
        files=_csv_file(),
        data={"date_from": "2026-08-02", "date_to": "2026-08-02"},
    )
    inbox = client.get("/api/imports/inbox", headers=h).json()["items"]
    assert len(inbox) == 1
    row = inbox[0]
    assert row["match_kind"] == "fuzzy"
    assert row["matched_transaction"]["id"] == manual_id

    merged = client.post(
        f"/api/imports/candidates/{row['id']}/merge",
        headers=h,
        json={},
    )
    assert merged.status_code == 200, merged.text
    updated = client.get(f"/api/transactions/{manual_id}", headers=h).json()
    assert Decimal(updated["amount"]) == Decimal("42.18")
    assert updated["note"] == "Costco"
    assert updated["category_id"] == groceries["id"]

    dashboard = client.get("/api/dashboard/monthly/2026/8", headers=h)
    assert dashboard.status_code == 200
    groceries_row = next(
        r
        for r in dashboard.json()["categories"]
        if r["category_id"] == groceries["id"]
    )
    assert Decimal(groceries_row["actual"]) == Decimal("42.18")
