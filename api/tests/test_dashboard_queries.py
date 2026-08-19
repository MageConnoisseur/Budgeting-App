"""Guard dashboard SQL volume: annual must not query once per month."""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import event

from app.database import engine
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


def _count_selects(fn) -> tuple[object, int]:
    statements: list[str] = []

    def before(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", before)
    try:
        result = fn()
    finally:
        event.remove(engine, "before_cursor_execute", before)
    selects = [s for s in statements if s.lstrip().lower().startswith("select")]
    return result, len(selects)


def test_annual_dashboard_query_count_does_not_scale_with_months() -> None:
    h = _auth()
    income = client.post(
        "/api/categories", headers=h, json={"kind": "income", "name": "Paycheck"}
    ).json()
    groceries = client.post(
        "/api/categories", headers=h, json={"kind": "expense", "name": "Groceries"}
    ).json()
    vacation = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": "Vacation", "target_amount": "500.00"},
    ).json()

    lines = [
        {"category_id": income["id"], "planned_amount": "3000.00"},
        {"category_id": groceries["id"], "planned_amount": "400.00"},
        {"category_id": vacation["id"], "planned_amount": "100.00"},
    ]
    for month in range(1, 13):
        put = client.put(
            f"/api/budgets/months/2026/{month}",
            headers=h,
            json={"lines": lines},
        )
        assert put.status_code == 200, put.text
        tx = client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": groceries["id"],
                "amount": "40.00",
                "date": f"2026-{month:02d}-10",
                "note": "Weekly shop",
            },
        )
        assert tx.status_code == 201, tx.text

    def fetch_annual():
        r = client.get("/api/dashboard/annual/2026", headers=h)
        assert r.status_code == 200, r.text
        return r.json()

    body, selects = _count_selects(fetch_annual)
    assert len(body["months"]) == 12
    grocery = next(c for c in body["category_trends"] if c["category_id"] == groceries["id"])
    assert Decimal(grocery["total_actual"]) == Decimal("480.00")
    # Auth + four ledger queries (categories, plans, transactions, schedules).
    # Joined loads may add a couple of extras; 12 months must not add 12× queries.
    assert selects <= 10, f"annual dashboard issued {selects} SELECTs"

    def fetch_monthly():
        r = client.get("/api/dashboard/monthly/2026/6", headers=h)
        assert r.status_code == 200, r.text
        return r.json()

    monthly, monthly_selects = _count_selects(fetch_monthly)
    grocery_row = next(
        c for c in monthly["categories"] if c["category_id"] == groceries["id"]
    )
    assert Decimal(grocery_row["actual"]) == Decimal("40.00")
    assert monthly_selects <= 12, f"monthly dashboard issued {monthly_selects} SELECTs"
