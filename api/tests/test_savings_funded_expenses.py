"""Savings-funded expenses: plan leftover, copy rules, paired tracker logs."""

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


def _cats(h: dict[str, str]) -> dict[str, dict]:
    income = client.post(
        "/api/categories", headers=h, json={"kind": "income", "name": "Paycheck"}
    ).json()
    groceries = client.post(
        "/api/categories", headers=h, json={"kind": "expense", "name": "Groceries"}
    ).json()
    car = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Car maintenance"},
    ).json()
    fund = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": "Car fund", "target_amount": "700.00"},
    ).json()
    return {"income": income, "groceries": groceries, "car": car, "fund": fund}


def test_september_car_bill_paid_from_bucket_keeps_month_manageable() -> None:
    h = _auth()
    c = _cats(h)
    put = client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "replace_all": True,
            "lines": [
                {"category_id": c["income"]["id"], "planned_amount": "4000.00"},
                {"category_id": c["groceries"]["id"], "planned_amount": "400.00"},
                {
                    "category_id": c["car"]["id"],
                    "planned_amount": "500.00",
                    "funded_by_category_id": c["fund"]["id"],
                },
                {"category_id": c["fund"]["id"], "planned_amount": "50.00"},
            ],
        },
    )
    assert put.status_code == 200, put.text
    car_line = next(
        line for line in put.json()["lines"] if line["category_id"] == c["car"]["id"]
    )
    assert car_line["funded_by_category_id"] == c["fund"]["id"]
    assert car_line["funded_by_category"]["name"] == "Car fund"

    dash = client.get("/api/dashboard/monthly/2026/9", headers=h)
    assert dash.status_code == 200, dash.text
    body = dash.json()
    leftover = body["leftover_planned"]
    # 4000 - 400 groceries - 50 contribution. $500 shop is from the bucket.
    assert Decimal(leftover["leftover"]) == Decimal("3550.00")
    assert Decimal(leftover["expense_from_savings"]) == Decimal("500.00")
    assert Decimal(body["coach"]["leftover_planned"]) == Decimal("3550.00")
    assert body["coach"]["tone"] == "surplus"

    bucket = next(
        b for b in body["savings_buckets"] if b["category_id"] == c["fund"]["id"]
    )
    assert Decimal(bucket["planned_use_this_period"]) == Decimal("500.00")

    funding = client.get(
        f"/api/budgets/months/2026/9/expense-funding/{c['car']['id']}",
        headers=h,
    )
    assert funding.status_code == 200, funding.text
    assert funding.json()["funded_by_category_id"] == c["fund"]["id"]
    assert funding.json()["funded_by_category_name"] == "Car fund"


def test_copy_forward_does_not_repeat_paid_from_link() -> None:
    h = _auth()
    c = _cats(h)
    jan = client.put(
        "/api/budgets/months/2026/1",
        headers=h,
        json={
            "replace_all": True,
            "lines": [
                {"category_id": c["income"]["id"], "planned_amount": "4000.00"},
                {
                    "category_id": c["car"]["id"],
                    "planned_amount": "500.00",
                    "funded_by_category_id": c["fund"]["id"],
                },
            ],
        },
    )
    assert jan.status_code == 200, jan.text
    feb = client.get("/api/budgets/months/2026/2", headers=h)
    assert feb.status_code == 200, feb.text
    assert feb.json()["seeded_from"] == "2026-01"
    car_line = next(
        line for line in feb.json()["lines"] if line["category_id"] == c["car"]["id"]
    )
    assert Decimal(car_line["planned_amount"]) == Decimal("500.00")
    assert car_line["funded_by_category_id"] is None


def test_copy_from_and_template_preserve_paid_from_link() -> None:
    h = _auth()
    c = _cats(h)
    client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "replace_all": True,
            "lines": [
                {"category_id": c["income"]["id"], "planned_amount": "4000.00"},
                {
                    "category_id": c["car"]["id"],
                    "planned_amount": "500.00",
                    "funded_by_category_id": c["fund"]["id"],
                },
            ],
        },
    )
    copied = client.post(
        "/api/budgets/months/2026/10/copy-from",
        headers=h,
        json={"source_year": 2026, "source_month": 9},
    )
    assert copied.status_code == 200, copied.text
    oct_car = next(
        line
        for line in copied.json()["lines"]
        if line["category_id"] == c["car"]["id"]
    )
    assert oct_car["funded_by_category_id"] == c["fund"]["id"]

    tpl = client.post(
        "/api/budgets/templates/save",
        headers=h,
        json={"name": "Shop month", "year": 2026, "month": 9},
    )
    assert tpl.status_code == 201, tpl.text
    tpl_car = next(
        line
        for line in tpl.json()["lines"]
        if line["category_id"] == c["car"]["id"]
    )
    assert tpl_car["funded_by_category_id"] == c["fund"]["id"]

    applied = client.post(
        "/api/budgets/months/2026/11/apply-template",
        headers=h,
        json={"template_id": tpl.json()["id"]},
    )
    assert applied.status_code == 200, applied.text
    nov_car = next(
        line
        for line in applied.json()["lines"]
        if line["category_id"] == c["car"]["id"]
    )
    assert nov_car["funded_by_category_id"] == c["fund"]["id"]


def test_reject_funding_on_savings_line_and_non_savings_source() -> None:
    h = _auth()
    c = _cats(h)
    bad_kind = client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "lines": [
                {
                    "category_id": c["fund"]["id"],
                    "planned_amount": "50.00",
                    "funded_by_category_id": c["fund"]["id"],
                }
            ]
        },
    )
    assert bad_kind.status_code == 400, bad_kind.text

    bad_source = client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "lines": [
                {
                    "category_id": c["car"]["id"],
                    "planned_amount": "500.00",
                    "funded_by_category_id": c["groceries"]["id"],
                }
            ]
        },
    )
    assert bad_source.status_code == 400, bad_source.text


def test_paired_expense_creates_matching_withdrawal() -> None:
    h = _auth()
    c = _cats(h)
    created = client.post(
        "/api/transactions",
        headers=h,
        json={
            "category_id": c["car"]["id"],
            "amount": "500.00",
            "date": "2026-09-12",
            "note": "Shop visit",
            "withdraw_from_category_id": c["fund"]["id"],
        },
    )
    assert created.status_code == 201, created.text
    expense = created.json()
    assert expense["pair_id"]
    listing = client.get("/api/transactions", headers=h)
    items = listing.json()["items"]
    assert len(items) == 2
    pair_ids = {i["pair_id"] for i in items}
    assert pair_ids == {expense["pair_id"]}
    amounts = sorted(Decimal(i["amount"]) for i in items)
    assert amounts == [Decimal("-500.00"), Decimal("500.00")]

    client.delete(f"/api/transactions/{expense['id']}", headers=h)
    after = client.get("/api/transactions", headers=h)
    assert after.json()["total"] == 0
    assert Decimal(expense["covered_amount"]) == Decimal("500.00")
    assert expense["covered_by_category_id"] == c["fund"]["id"]


def _tx(h: dict[str, str], **body: object) -> dict:
    created = client.post("/api/transactions", headers=h, json=body)
    assert created.status_code == 201, created.text
    return created.json()


def test_partial_cover_leaves_the_rest_on_the_paycheck() -> None:
    """$800 expense, $500 planned from income, $300 from the bucket."""
    h = _auth()
    c = _cats(h)
    planned = client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "replace_all": True,
            "lines": [
                {"category_id": c["income"]["id"], "planned_amount": "4000.00"},
                {"category_id": c["car"]["id"], "planned_amount": "500.00"},
                {"category_id": c["fund"]["id"], "planned_amount": "0.00"},
            ],
        },
    )
    assert planned.status_code == 200, planned.text
    _tx(
        h,
        category_id=c["income"]["id"],
        amount="4000.00",
        date="2026-09-01",
        note="Paycheck",
    )
    expense = _tx(
        h,
        category_id=c["car"]["id"],
        amount="800.00",
        date="2026-09-12",
        note="Unexpected repair",
        withdraw_from_category_id=c["fund"]["id"],
        withdraw_amount="300.00",
    )
    assert Decimal(expense["covered_amount"]) == Decimal("300.00")
    assert expense["covered_by_category_name"] == "Car fund"

    listing = client.get("/api/transactions", headers=h).json()["items"]
    amounts = sorted(Decimal(i["amount"]) for i in listing)
    assert amounts == [Decimal("-300.00"), Decimal("800.00"), Decimal("4000.00")]

    dash = client.get("/api/dashboard/monthly/2026/9", headers=h)
    assert dash.status_code == 200, dash.text
    body = dash.json()
    leftover = body["leftover_actual"]
    # Paycheck covers $500. The extra $300 is the bucket, not new savings.
    assert Decimal(leftover["expense_from_income"]) == Decimal("500.00")
    assert Decimal(leftover["expense_from_savings"]) == Decimal("300.00")
    assert Decimal(leftover["savings_contributions"]) == Decimal("0.00")
    assert Decimal(leftover["leftover"]) == Decimal("3500.00")
    assert Decimal(body["savings"]["actual"]) == Decimal("-300.00")
    car = next(row for row in body["categories"] if row["category_id"] == c["car"]["id"])
    assert Decimal(car["actual"]) == Decimal("800.00")
    assert car["over_budget"] is True
    bucket = next(
        b for b in body["savings_buckets"] if b["category_id"] == c["fund"]["id"]
    )
    assert Decimal(bucket["balance"]) == Decimal("-300.00")
    assert Decimal(bucket["actual_use_this_period"]) == Decimal("300.00")
    split = body["flexible_split"]
    assert Decimal(split["funded_actual"]) == Decimal("300.00")
    paycheck_spend = Decimal(split["flexible_actual"]) + Decimal(split["committed_actual"])
    assert paycheck_spend == Decimal("500.00")


def test_split_bill_is_two_expenses_one_from_the_bucket() -> None:
    """$500 from income plus $300 paid entirely from the bucket."""
    h = _auth()
    c = _cats(h)
    client.put(
        "/api/budgets/months/2026/9",
        headers=h,
        json={
            "replace_all": True,
            "lines": [
                {"category_id": c["income"]["id"], "planned_amount": "4000.00"},
                {"category_id": c["car"]["id"], "planned_amount": "500.00"},
            ],
        },
    )
    _tx(
        h,
        category_id=c["income"]["id"],
        amount="4000.00",
        date="2026-09-01",
    )
    paycheck_part = _tx(
        h,
        category_id=c["car"]["id"],
        amount="500.00",
        date="2026-09-12",
        note="Planned repair",
    )
    assert paycheck_part["covered_amount"] is None
    bucket_part = _tx(
        h,
        category_id=c["car"]["id"],
        amount="300.00",
        date="2026-09-12",
        note="Unexpected extra",
        withdraw_from_category_id=c["fund"]["id"],
    )
    assert Decimal(bucket_part["covered_amount"]) == Decimal("300.00")

    dash = client.get("/api/dashboard/monthly/2026/9", headers=h).json()
    leftover = dash["leftover_actual"]
    assert Decimal(leftover["expense_from_income"]) == Decimal("500.00")
    assert Decimal(leftover["expense_from_savings"]) == Decimal("300.00")
    assert Decimal(leftover["savings_contributions"]) == Decimal("0.00")
    assert Decimal(leftover["leftover"]) == Decimal("3500.00")
    assert Decimal(dash["savings"]["actual"]) == Decimal("-300.00")
    car = next(row for row in dash["categories"] if row["category_id"] == c["car"]["id"])
    assert Decimal(car["actual"]) == Decimal("800.00")
    assert car["over_budget"] is True
    bucket = next(b for b in dash["savings_buckets"] if b["category_id"] == c["fund"]["id"])
    assert Decimal(bucket["balance"]) == Decimal("-300.00")


def test_withdraw_amount_cannot_exceed_the_expense() -> None:
    h = _auth()
    c = _cats(h)
    created = client.post(
        "/api/transactions",
        headers=h,
        json={
            "category_id": c["car"]["id"],
            "amount": "800.00",
            "date": "2026-09-12",
            "withdraw_from_category_id": c["fund"]["id"],
            "withdraw_amount": "801.00",
        },
    )
    assert created.status_code == 400, created.text


def test_editing_keeps_a_partial_cover_and_can_change_it() -> None:
    h = _auth()
    c = _cats(h)
    expense = _tx(
        h,
        category_id=c["car"]["id"],
        amount="800.00",
        date="2026-09-12",
        note="Repair",
        withdraw_from_category_id=c["fund"]["id"],
        withdraw_amount="300.00",
    )
    noted = client.patch(
        f"/api/transactions/{expense['id']}",
        headers=h,
        json={"note": "Repair, brakes"},
    )
    assert noted.status_code == 200, noted.text
    assert Decimal(noted.json()["covered_amount"]) == Decimal("300.00")

    widened = client.patch(
        f"/api/transactions/{expense['id']}",
        headers=h,
        json={"amount": "900.00"},
    )
    assert widened.status_code == 200, widened.text
    assert Decimal(widened.json()["amount"]) == Decimal("900.00")
    assert Decimal(widened.json()["covered_amount"]) == Decimal("300.00")

    raised = client.patch(
        f"/api/transactions/{expense['id']}",
        headers=h,
        json={"withdraw_amount": "450.00"},
    )
    assert raised.status_code == 200, raised.text
    assert Decimal(raised.json()["covered_amount"]) == Decimal("450.00")

    cleared = client.patch(
        f"/api/transactions/{expense['id']}",
        headers=h,
        json={"withdraw_from_category_id": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["covered_amount"] is None
    assert cleared.json()["pair_id"] is None
    listing = client.get("/api/transactions", headers=h).json()
    assert listing["total"] == 1


def test_full_cover_follows_an_edited_expense_amount() -> None:
    h = _auth()
    c = _cats(h)
    expense = _tx(
        h,
        category_id=c["car"]["id"],
        amount="500.00",
        date="2026-09-12",
        withdraw_from_category_id=c["fund"]["id"],
    )
    updated = client.patch(
        f"/api/transactions/{expense['id']}",
        headers=h,
        json={"amount": "520.00"},
    )
    assert updated.status_code == 200, updated.text
    assert Decimal(updated.json()["covered_amount"]) == Decimal("520.00")
