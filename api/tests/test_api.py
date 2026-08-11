"""API integration tests against the configured DATABASE_URL."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    username = f"user_{uuid.uuid4().hex[:10]}"
    password = "testpass123"
    r = client.post("/api/auth/register", json={"username": username, "password": password})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_cors_allows_vercel_preview_origin() -> None:
    origin = "https://budgeting-app-ondeckporjects.vercel.app"
    preflight = client.options(
        "/api/auth/register",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == origin

    username = f"cors_{uuid.uuid4().hex[:8]}"
    register = client.post(
        "/api/auth/register",
        headers={"Origin": origin},
        json={"username": username, "password": "password123"},
    )
    assert register.status_code == 201, register.text
    assert register.headers.get("access-control-allow-origin") == origin


def test_register_login_and_me(auth_headers: dict[str, str]) -> None:
    r = client.get("/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["preferred_budget_view"] == "monthly"
    assert "username" in body


def test_category_crud_and_budget_copy_forward(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    rent = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Rent", "sort_order": 1},
    )
    assert rent.status_code == 201, rent.text
    rent_id = rent.json()["id"]

    paycheck = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "income", "name": "Paycheck", "sort_order": 0},
    )
    assert paycheck.status_code == 201
    income_id = paycheck.json()["id"]

    emergency = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": "Emergency", "sort_order": 0},
    )
    assert emergency.status_code == 201
    savings_id = emergency.json()["id"]

    # Seed January plan
    jan = client.put(
        "/api/budgets/months/2026/1",
        headers=h,
        json={
            "replace_all": True,
            "lines": [
                {"category_id": rent_id, "planned_amount": "1500.00"},
                {"category_id": income_id, "planned_amount": "4000.00"},
                {"category_id": savings_id, "planned_amount": "200.00"},
            ],
        },
    )
    assert jan.status_code == 200, jan.text
    assert len(jan.json()["lines"]) == 3

    # February should auto-seed from January
    feb = client.get("/api/budgets/months/2026/2", headers=h)
    assert feb.status_code == 200, feb.text
    assert feb.json()["seeded_from"] == "2026-01"
    amounts = {line["category_id"]: line["planned_amount"] for line in feb.json()["lines"]}
    assert Decimal(amounts[rent_id]) == Decimal("1500.00")

    # Annual cell edit creates/updates a month
    cell = client.put(
        "/api/budgets/annual/cell",
        headers=h,
        json={
            "year": 2026,
            "month": 3,
            "category_id": rent_id,
            "planned_amount": "1600.00",
        },
    )
    assert cell.status_code == 200, cell.text
    march_rent = next(
        line for line in cell.json()["lines"] if line["category_id"] == rent_id
    )
    assert Decimal(march_rent["planned_amount"]) == Decimal("1600.00")

    # Template save + apply
    tpl = client.post(
        "/api/budgets/templates/save",
        headers=h,
        json={"name": "Baseline", "year": 2026, "month": 1},
    )
    assert tpl.status_code == 201, tpl.text
    template_id = tpl.json()["id"]

    applied = client.post(
        "/api/budgets/months/2026/4/apply-template",
        headers=h,
        json={"template_id": template_id},
    )
    assert applied.status_code == 200, applied.text
    assert len(applied.json()["lines"]) == 3


def test_transactions_search_sort_filter_and_dashboard(
    auth_headers: dict[str, str],
) -> None:
    h = auth_headers
    groceries = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Groceries"},
    ).json()
    vacation = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": "Vacation"},
    ).json()

    client.put(
        "/api/budgets/months/2026/5",
        headers=h,
        json={
            "lines": [
                {"category_id": groceries["id"], "planned_amount": "400.00"},
                {"category_id": vacation["id"], "planned_amount": "100.00"},
            ]
        },
    )

    tx1 = client.post(
        "/api/transactions",
        headers=h,
        json={
            "category_id": groceries["id"],
            "amount": "55.25",
            "date": "2026-05-03",
            "note": "Trader Joe weekly run",
        },
    )
    assert tx1.status_code == 201, tx1.text

    tx2 = client.post(
        "/api/transactions",
        headers=h,
        json={
            "category_id": vacation["id"],
            "amount": "100.00",
            "date": "2026-05-10",
            "note": "May contribution",
        },
    )
    assert tx2.status_code == 201

    # Over-budget soft path: large grocery spend should still succeed
    over = client.post(
        "/api/transactions",
        headers=h,
        json={
            "category_id": groceries["id"],
            "amount": "500.00",
            "date": "2026-05-20",
            "note": "Big Costco trip",
        },
    )
    assert over.status_code == 201

    found = client.get("/api/transactions", headers=h, params={"q": "Trader"})
    assert found.status_code == 200
    assert found.json()["total"] >= 1
    assert any("Trader" in (i["note"] or "") for i in found.json()["items"])

    filtered = client.get(
        "/api/transactions",
        headers=h,
        params={"kind": "expense", "sort_by": "amount", "sort_dir": "desc"},
    )
    assert filtered.status_code == 200
    amounts = [Decimal(i["amount"]) for i in filtered.json()["items"]]
    assert amounts == sorted(amounts, reverse=True)

    dash = client.get("/api/dashboard/monthly/2026/5", headers=h)
    assert dash.status_code == 200, dash.text
    body = dash.json()
    assert body["expense"]["over_budget"] is True
    grocery_row = next(c for c in body["categories"] if c["category_id"] == groceries["id"])
    assert grocery_row["over_budget"] is True
    assert Decimal(grocery_row["actual"]) == Decimal("555.25")

    annual = client.get("/api/dashboard/annual/2026", headers=h)
    assert annual.status_code == 200
    assert len(annual.json()["months"]) == 12

    balances = client.get("/api/dashboard/savings-balances", headers=h)
    assert balances.status_code == 200
    vac = next(b for b in balances.json() if b["category_id"] == vacation["id"])
    assert Decimal(vac["balance"]) == Decimal("100.00")

    layout = client.put(
        "/api/dashboard/layout/monthly",
        headers=h,
        json={
            "widgets": [
                {
                    "id": "expense-progress",
                    "type": "kind_progress",
                    "title": "Expenses",
                    "order": 0,
                    "config": {"kind": "expense"},
                }
            ]
        },
    )
    assert layout.status_code == 200
    got = client.get("/api/dashboard/layout/monthly", headers=h)
    assert len(got.json()["widgets"]) == 1


def test_preferences(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    r = client.patch(
        "/api/auth/me/preferences",
        headers=h,
        json={"preferred_budget_view": "annual", "preferred_dashboard_view": "annual"},
    )
    assert r.status_code == 200
    assert r.json()["preferred_budget_view"] == "annual"
    assert r.json()["preferred_dashboard_view"] == "annual"
