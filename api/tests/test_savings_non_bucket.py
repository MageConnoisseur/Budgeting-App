"""Non-bucket savings lines (mix-only, e.g. extra loan payments)."""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _auth() -> dict[str, str]:
    username = f"user_{uuid.uuid4().hex[:10]}"
    r = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "testpass123",
        },
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_savings_default_is_bucket() -> None:
    h = _auth()
    created = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": "Emergency"},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["is_bucket"] is True
    assert body["paid_toward"] == "0.00"


def test_reject_is_bucket_false_on_expense() -> None:
    h = _auth()
    r = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Groceries", "is_bucket": False},
    )
    assert r.status_code == 400


def test_reject_target_on_non_bucket_savings() -> None:
    h = _auth()
    r = client.post(
        "/api/categories",
        headers=h,
        json={
            "kind": "savings",
            "name": "Extra loan payments",
            "is_bucket": False,
            "target_amount": "500.00",
        },
    )
    assert r.status_code == 400, r.text


def test_non_bucket_counts_in_mix_not_on_bucket_charts() -> None:
    h = _auth()
    paycheck = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "income", "name": "Paycheck"},
    ).json()
    groceries = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Groceries"},
    ).json()
    emergency = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": "Emergency"},
    ).json()
    extra = client.post(
        "/api/categories",
        headers=h,
        json={
            "kind": "savings",
            "name": "Extra loan payments",
            "is_bucket": False,
        },
    )
    assert extra.status_code == 201, extra.text
    extra = extra.json()
    assert extra["is_bucket"] is False
    assert extra["target_amount"] is None

    put = client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "lines": [
                {"category_id": paycheck["id"], "planned_amount": "3000.00"},
                {"category_id": groceries["id"], "planned_amount": "400.00"},
                {"category_id": emergency["id"], "planned_amount": "200.00"},
                {"category_id": extra["id"], "planned_amount": "150.00"},
            ]
        },
    )
    assert put.status_code == 200, put.text

    logged = client.post(
        "/api/transactions",
        headers=h,
        json={
            "category_id": extra["id"],
            "amount": "150.00",
            "date": "2026-09-05",
            "note": "extra principal",
        },
    )
    assert logged.status_code == 201, logged.text

    listed = client.get("/api/categories", headers=h)
    assert listed.status_code == 200
    extra_row = next(c for c in listed.json() if c["id"] == extra["id"])
    assert extra_row["is_bucket"] is False
    assert Decimal(extra_row["paid_toward"]) == Decimal("150.00")

    dash = client.get("/api/dashboard/monthly/2026/9", headers=h)
    assert dash.status_code == 200, dash.text
    body = dash.json()
    assert Decimal(body["savings"]["planned"]) == Decimal("350.00")
    assert Decimal(body["savings"]["actual"]) == Decimal("150.00")
    leftover = body["leftover_planned"]
    assert Decimal(leftover["savings_contributions"]) == Decimal("350.00")
    assert Decimal(leftover["leftover"]) == Decimal("2250.00")

    bucket_ids = {b["category_id"] for b in body["savings_buckets"]}
    assert extra["id"] not in bucket_ids
    assert emergency["id"] in bucket_ids

    progress = next(c for c in body["categories"] if c["category_id"] == extra["id"])
    assert progress["is_bucket"] is False
    assert Decimal(progress["actual"]) == Decimal("150.00")

    annual = client.get("/api/dashboard/annual/2026", headers=h)
    assert annual.status_code == 200, annual.text
    annual_ids = {b["category_id"] for b in annual.json()["savings_buckets"]}
    assert extra["id"] not in annual_ids
    history_ids = {s["category_id"] for s in annual.json()["savings_history"]}
    assert extra["id"] not in history_ids

    balances = client.get("/api/dashboard/savings-balances", headers=h)
    assert balances.status_code == 200
    balance_ids = {b["category_id"] for b in balances.json()}
    assert extra["id"] not in balance_ids
    assert emergency["id"] in balance_ids

    glance = client.get(
        "/api/mobile/glance", params={"year": 2026, "month": 9}, headers=h
    )
    assert glance.status_code == 200, glance.text
    glance_row = next(
        c for c in glance.json()["categories"] if c["category_id"] == extra["id"]
    )
    assert glance_row["balance"] is None
    assert Decimal(glance_row["actual"]) == Decimal("150.00")


def test_cannot_pay_expense_from_non_bucket() -> None:
    h = _auth()
    extra = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": "Extra loan", "is_bucket": False},
    ).json()
    car = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Car shop"},
    ).json()
    bad = client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "lines": [
                {
                    "category_id": car["id"],
                    "planned_amount": "200.00",
                    "funded_by_category_id": extra["id"],
                }
            ]
        },
    )
    assert bad.status_code == 400, bad.text


def test_converting_to_non_bucket_clears_target_and_paid_from() -> None:
    h = _auth()
    fund = client.post(
        "/api/categories",
        headers=h,
        json={
            "kind": "savings",
            "name": "Car fund",
            "target_amount": "700.00",
        },
    ).json()
    car = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Car shop"},
    ).json()
    put = client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "lines": [
                {
                    "category_id": car["id"],
                    "planned_amount": "200.00",
                    "funded_by_category_id": fund["id"],
                }
            ]
        },
    )
    assert put.status_code == 200, put.text
    patched = client.patch(
        f"/api/categories/{fund['id']}",
        headers=h,
        json={"is_bucket": False},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["is_bucket"] is False
    assert patched.json()["target_amount"] is None

    month = client.get("/api/budgets/months/2026/9", headers=h)
    assert month.status_code == 200
    car_line = next(
        line
        for line in month.json()["lines"]
        if line["category_id"] == car["id"]
    )
    assert car_line["funded_by_category_id"] is None
