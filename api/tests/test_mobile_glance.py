"""Compact leftover glance for the phone logger."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.database import SessionLocal
from app.main import app
from app.models import BudgetMonth, Transaction

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


def _by_name(rows: list[dict], name: str) -> dict:
    return next(row for row in rows if row["category_name"] == name)


def test_glance_requires_auth() -> None:
    r = client.get("/api/mobile/glance", params={"year": 2026, "month": 9})
    assert r.status_code == 401


def test_glance_rejects_invalid_month() -> None:
    h = _auth()
    r = client.get("/api/mobile/glance", params={"year": 2026, "month": 13}, headers=h)
    assert r.status_code == 400


def test_expense_leftover_is_plan_minus_spend() -> None:
    h = _auth()
    groceries = client.post(
        "/api/categories", headers=h, json={"kind": "expense", "name": "Groceries"}
    ).json()
    put = client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "replace_all": True,
            "lines": [{"category_id": groceries["id"], "planned_amount": "400.00"}],
        },
    )
    assert put.status_code == 200, put.text
    assert (
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": groceries["id"],
                "amount": "212.50",
                "date": "2026-09-10",
            },
        ).status_code
        == 201
    )

    glance = client.get(
        "/api/mobile/glance", params={"year": 2026, "month": 9}, headers=h
    )
    assert glance.status_code == 200, glance.text
    row = _by_name(glance.json()["categories"], "Groceries")
    assert Decimal(row["planned"]) == Decimal("400.00")
    assert Decimal(row["actual"]) == Decimal("212.50")
    assert Decimal(row["remaining"]) == Decimal("187.50")
    assert row["over_budget"] is False
    assert row["balance"] is None
    assert row["kind"] == "expense"


def test_refunds_increase_expense_leftover() -> None:
    h = _auth()
    me = client.get("/api/auth/me", headers=h).json()
    groceries = client.post(
        "/api/categories", headers=h, json={"kind": "expense", "name": "Groceries"}
    ).json()
    assert (
        client.put(
            "/api/budgets/months/2026/9",
            headers=h,
            json={
                "replace_all": True,
                "lines": [{"category_id": groceries["id"], "planned_amount": "100.00"}],
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": groceries["id"],
                "amount": "40.00",
                "date": "2026-09-08",
            },
        ).status_code
        == 201
    )

    db = SessionLocal()
    try:
        db.add(
            Transaction(
                user_id=uuid.UUID(me["id"]),
                category_id=uuid.UUID(groceries["id"]),
                amount=Decimal("-12.50"),
                date=date(2026, 9, 12),
                note="merchant refund",
            )
        )
        db.commit()
    finally:
        db.close()

    glance = client.get(
        "/api/mobile/glance", params={"year": 2026, "month": 9}, headers=h
    )
    assert glance.status_code == 200, glance.text
    row = _by_name(glance.json()["categories"], "Groceries")
    assert Decimal(row["actual"]) == Decimal("27.50")
    assert Decimal(row["remaining"]) == Decimal("72.50")


def test_savings_actual_ignores_withdrawals_balance_includes_them() -> None:
    h = _auth()
    vacation = client.post(
        "/api/categories", headers=h, json={"kind": "savings", "name": "Vacation"}
    ).json()
    assert (
        client.put(
            "/api/budgets/months/2026/9",
            headers=h,
            json={
                "replace_all": True,
                "lines": [{"category_id": vacation["id"], "planned_amount": "200.00"}],
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": vacation["id"],
                "amount": "200.00",
                "date": "2026-09-02",
                "note": "deposit",
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": vacation["id"],
                "amount": "-50.00",
                "date": "2026-09-20",
                "note": "flight",
            },
        ).status_code
        == 201
    )

    glance = client.get(
        "/api/mobile/glance", params={"year": 2026, "month": 9}, headers=h
    )
    assert glance.status_code == 200, glance.text
    row = _by_name(glance.json()["categories"], "Vacation")
    assert Decimal(row["planned"]) == Decimal("200.00")
    assert Decimal(row["actual"]) == Decimal("200.00")
    assert Decimal(row["remaining"]) == Decimal("0.00")
    assert Decimal(row["balance"]) == Decimal("150.00")
    assert row["over_budget"] is False


def test_no_budget_month_planned_is_zero_and_glance_does_not_seed() -> None:
    h = _auth()
    me = client.get("/api/auth/me", headers=h).json()
    groceries = client.post(
        "/api/categories", headers=h, json={"kind": "expense", "name": "Groceries"}
    ).json()
    assert (
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": groceries["id"],
                "amount": "30.00",
                "date": "2026-04-04",
            },
        ).status_code
        == 201
    )

    db = SessionLocal()
    try:
        before = db.scalar(
            select(func.count())
            .select_from(BudgetMonth)
            .where(BudgetMonth.user_id == uuid.UUID(me["id"]))
        )
    finally:
        db.close()

    glance = client.get(
        "/api/mobile/glance", params={"year": 2026, "month": 4}, headers=h
    )
    assert glance.status_code == 200, glance.text
    row = _by_name(glance.json()["categories"], "Groceries")
    assert Decimal(row["planned"]) == Decimal("0.00")
    assert Decimal(row["actual"]) == Decimal("30.00")
    assert Decimal(row["remaining"]) == Decimal("-30.00")
    assert row["over_budget"] is True

    db = SessionLocal()
    try:
        after = db.scalar(
            select(func.count())
            .select_from(BudgetMonth)
            .where(BudgetMonth.user_id == uuid.UUID(me["id"]))
        )
    finally:
        db.close()
    assert after == before == 0


def test_archived_categories_omitted_from_glance() -> None:
    h = _auth()
    live = client.post(
        "/api/categories", headers=h, json={"kind": "expense", "name": "Dining"}
    ).json()
    old = client.post(
        "/api/categories", headers=h, json={"kind": "expense", "name": "Old club"}
    ).json()
    archived = client.patch(
        f"/api/categories/{old['id']}", headers=h, json={"archived": True}
    )
    assert archived.status_code == 200, archived.text

    glance = client.get(
        "/api/mobile/glance", params={"year": 2026, "month": 9}, headers=h
    )
    assert glance.status_code == 200, glance.text
    names = {row["category_name"] for row in glance.json()["categories"]}
    assert "Dining" in names
    assert "Old club" not in names
    assert live["id"]
