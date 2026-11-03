"""Tests for recurring schedules, pattern tips, and income estimates."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.recurring import next_occurrence_on_or_after
from app.enums import RecurrenceFrequency

client = TestClient(app)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    username = f"rec_{uuid.uuid4().hex[:10]}"
    password = "testpass123"
    email = f"{username}@example.com"
    r = client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _income_expense_cats(h: dict[str, str]) -> tuple[str, str]:
    inc = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "income", "name": f"Paycheck {uuid.uuid4().hex[:6]}"},
    )
    assert inc.status_code == 201, inc.text
    exp = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": f"Rent {uuid.uuid4().hex[:6]}"},
    )
    assert exp.status_code == 201, exp.text
    return inc.json()["id"], exp.json()["id"]


def test_next_occurrence_helpers() -> None:
    d = next_occurrence_on_or_after(
        frequency=RecurrenceFrequency.monthly,
        anchor_day=15,
        start_date=date(2026, 1, 1),
        on_or_after=date(2026, 3, 16),
    )
    assert d == date(2026, 4, 15)

    d2 = next_occurrence_on_or_after(
        frequency=RecurrenceFrequency.weekly,
        anchor_day=5,  # Friday
        start_date=date(2026, 8, 1),  # Saturday
        on_or_after=date(2026, 8, 1),
    )
    assert d2.isoweekday() == 5
    assert d2 >= date(2026, 8, 1)

    d3 = next_occurrence_on_or_after(
        frequency=RecurrenceFrequency.semimonthly,
        anchor_day=1,
        start_date=date(2026, 8, 1),
        on_or_after=date(2026, 8, 2),
    )
    assert d3 == date(2026, 8, 15)


def test_create_list_log_skip_schedule(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    income_id, expense_id = _income_expense_cats(h)

    create = client.post(
        "/api/recurring-schedules",
        headers=h,
        json={
            "category_id": income_id,
            "amount": "2500.00",
            "note": "Biweekly pay",
            "frequency": "biweekly",
            "anchor_day": date.today().isoweekday(),
            "start_date": date.today().isoformat(),
        },
    )
    assert create.status_code == 201, create.text
    sched = create.json()
    assert sched["amount"] == "2500.00"
    assert sched["frequency"] == "biweekly"
    assert sched["active"] is True

    listed = client.get("/api/recurring-schedules", headers=h)
    assert listed.status_code == 200
    assert any(i["id"] == sched["id"] for i in listed.json()["items"])

    due = client.get("/api/recurring-schedules/due", headers=h)
    assert due.status_code == 200
    assert any(i["id"] == sched["id"] for i in due.json()["items"])

    logged = client.post(
        f"/api/recurring-schedules/{sched['id']}/log",
        headers=h,
        json={},
    )
    assert logged.status_code == 200, logged.text
    body = logged.json()
    assert body["transaction"]["amount"] == "2500.00"
    assert body["transaction"]["category_id"] == income_id
    assert body["schedule"]["next_occurrence"] > sched["next_occurrence"]

    # Expense monthly rent schedule + skip
    rent = client.post(
        "/api/recurring-schedules",
        headers=h,
        json={
            "category_id": expense_id,
            "amount": "1800.00",
            "note": "Rent",
            "frequency": "monthly",
            "anchor_day": min(date.today().day, 28),
            "start_date": date.today().isoformat(),
        },
    )
    assert rent.status_code == 201, rent.text
    rent_id = rent.json()["id"]
    before = rent.json()["next_occurrence"]
    skipped = client.post(f"/api/recurring-schedules/{rent_id}/skip", headers=h)
    assert skipped.status_code == 200, skipped.text
    assert skipped.json()["next_occurrence"] > before

    deleted = client.delete(f"/api/recurring-schedules/{rent_id}", headers=h)
    assert deleted.status_code == 200


def test_pattern_suggestions_and_income_estimate(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    income_id, _ = _income_expense_cats(h)

    # Seed ~monthly paychecks for 4 months prior to current month.
    today = date.today()
    for months_ago in (4, 3, 2, 1):
        y = today.year
        m = today.month - months_ago
        while m <= 0:
            m += 12
            y -= 1
        pay_day = date(y, m, min(15, 28))
        r = client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": income_id,
                "amount": "3000.00",
                "date": pay_day.isoformat(),
                "note": "Paycheck",
            },
        )
        assert r.status_code == 201, r.text

    tips = client.get("/api/recurring-schedules/suggestions", headers=h)
    assert tips.status_code == 200, tips.text
    items = tips.json()["items"]
    assert any(i["category_id"] == income_id for i in items)
    match = next(i for i in items if i["category_id"] == income_id)
    assert match["suggested_frequency"] in ("monthly", "biweekly", "semimonthly", "weekly")
    assert Decimal(match["suggested_amount"]) == Decimal("3000.00")

    est = client.get(
        "/api/recurring-schedules/income-estimate",
        headers=h,
        params={"year": today.year, "month": today.month},
    )
    assert est.status_code == 200, est.text
    data = est.json()
    assert Decimal(data["estimated_total"]) == Decimal("3000.00")
    assert data["based_on_history"] >= 1
    assert any(c["category_id"] == income_id for c in data["categories"])

    # Creating a schedule should prefer schedule projection over history.
    sched = client.post(
        "/api/recurring-schedules",
        headers=h,
        json={
            "category_id": income_id,
            "amount": "3200.00",
            "frequency": "monthly",
            "anchor_day": 15,
            "start_date": date(today.year, today.month, 1).isoformat(),
        },
    )
    assert sched.status_code == 201, sched.text
    est2 = client.get(
        "/api/recurring-schedules/income-estimate",
        headers=h,
        params={"year": today.year, "month": today.month},
    )
    assert est2.status_code == 200
    assert Decimal(est2.json()["estimated_total"]) == Decimal("3200.00")
    assert est2.json()["based_on_schedules"] >= 1


def _prior_month_dates(count: int = 4) -> list[date]:
    today = date.today()
    out: list[date] = []
    for months_ago in range(count, 0, -1):
        y = today.year
        m = today.month - months_ago
        while m <= 0:
            m += 12
            y -= 1
        out.append(date(y, m, min(15, 28)))
    return out


def test_savings_contribution_and_withdrawal_schedules(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    fund = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": f"Emergency {uuid.uuid4().hex[:6]}"},
    )
    assert fund.status_code == 201, fund.text
    fund_id = fund.json()["id"]
    expense = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": f"Rent {uuid.uuid4().hex[:6]}"},
    )
    assert expense.status_code == 201, expense.text
    expense_id = expense.json()["id"]

    today = date.today()
    start = date(today.year, today.month, 1)
    anchor = min(today.day, 28)

    created = client.post(
        "/api/recurring-schedules",
        headers=h,
        json={
            "category_id": fund_id,
            "amount": "200.00",
            "note": "Emergency transfer",
            "frequency": "monthly",
            "anchor_day": anchor,
            "start_date": start.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    sched = created.json()
    assert sched["category"]["kind"] == "savings"
    assert Decimal(sched["amount"]) == Decimal("200.00")

    listed = client.get(
        "/api/recurring-schedules",
        headers=h,
        params={"kind": "savings", "active_only": False},
    )
    assert listed.status_code == 200, listed.text
    assert any(i["id"] == sched["id"] for i in listed.json()["items"])

    logged = client.post(f"/api/recurring-schedules/{sched['id']}/log", headers=h, json={})
    assert logged.status_code == 200, logged.text
    tx = logged.json()["transaction"]
    assert tx["category_id"] == fund_id
    assert Decimal(tx["amount"]) == Decimal("200.00")
    assert tx["pair_id"] is None
    assert tx["note"] == "Emergency transfer"

    withdrawal = client.post(
        "/api/recurring-schedules",
        headers=h,
        json={
            "category_id": fund_id,
            "amount": "-75.00",
            "note": "Move to checking",
            "frequency": "monthly",
            "anchor_day": anchor,
            "start_date": start.isoformat(),
        },
    )
    assert withdrawal.status_code == 201, withdrawal.text
    withdrawal_id = withdrawal.json()["id"]

    dash = client.get(
        f"/api/dashboard/monthly/{today.year}/{today.month}",
        headers=h,
    )
    assert dash.status_code == 200, dash.text
    load = dash.json()["recurring_load"]
    withdraw_row = next(i for i in load if i["schedule_id"] == withdrawal_id)
    assert withdraw_row["kind"] == "savings"
    assert Decimal(withdraw_row["amount"]) == Decimal("-75.00")

    pulled = client.post(
        f"/api/recurring-schedules/{withdrawal_id}/log",
        headers=h,
        json={},
    )
    assert pulled.status_code == 200, pulled.text
    pulled_tx = pulled.json()["transaction"]
    assert Decimal(pulled_tx["amount"]) == Decimal("-75.00")
    assert pulled_tx["pair_id"] is None

    # An expense schedule can be pointed at savings, but a negative expense cannot.
    rent = client.post(
        "/api/recurring-schedules",
        headers=h,
        json={
            "category_id": expense_id,
            "amount": "10.00",
            "frequency": "monthly",
            "anchor_day": anchor,
            "start_date": start.isoformat(),
        },
    )
    assert rent.status_code == 201, rent.text
    negative = client.patch(
        f"/api/recurring-schedules/{rent.json()['id']}",
        headers=h,
        json={"amount": "-10.00"},
    )
    assert negative.status_code == 400, negative.text
    moved = client.patch(
        f"/api/recurring-schedules/{rent.json()['id']}",
        headers=h,
        json={"category_id": fund_id, "amount": "40.00"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["category"]["kind"] == "savings"
    assert Decimal(moved.json()["amount"]) == Decimal("40.00")

    extra = client.post(
        "/api/categories",
        headers=h,
        json={
            "kind": "savings",
            "name": f"Loan {uuid.uuid4().hex[:6]}",
            "is_bucket": False,
        },
    )
    assert extra.status_code == 201, extra.text
    loan = client.post(
        "/api/recurring-schedules",
        headers=h,
        json={
            "category_id": extra.json()["id"],
            "amount": "125.00",
            "frequency": "monthly",
            "anchor_day": anchor,
            "start_date": start.isoformat(),
        },
    )
    assert loan.status_code == 201, loan.text
    assert loan.json()["category"]["is_bucket"] is False

    archived = client.delete(f"/api/categories/{extra.json()['id']}", headers=h)
    assert archived.status_code == 204, archived.text
    blocked = client.post(
        f"/api/recurring-schedules/{loan.json()['id']}/log",
        headers=h,
        json={},
    )
    assert blocked.status_code == 400, blocked.text


def test_savings_patterns_keep_sign_and_skip_paired_covers(
    auth_headers: dict[str, str],
) -> None:
    h = auth_headers
    fund = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": f"House {uuid.uuid4().hex[:6]}"},
    ).json()
    car = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": f"Car {uuid.uuid4().hex[:6]}"},
    ).json()
    standalone = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": f"Brokerage {uuid.uuid4().hex[:6]}"},
    ).json()

    for day in _prior_month_dates():
        paid = client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": car["id"],
                "amount": "500.00",
                "date": day.isoformat(),
                "note": "Shop",
                "withdraw_from_category_id": fund["id"],
            },
        )
        assert paid.status_code == 201, paid.text
        withdraw = client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": standalone["id"],
                "amount": "-150.00",
                "date": day.isoformat(),
                "note": "Invest",
            },
        )
        assert withdraw.status_code == 201, withdraw.text

    tips = client.get("/api/recurring-schedules/suggestions", headers=h)
    assert tips.status_code == 200, tips.text
    items = tips.json()["items"]
    assert all(i["category_id"] != fund["id"] for i in items)
    car_tip = next(i for i in items if i["category_id"] == car["id"])
    assert car_tip["kind"] == "expense"
    assert Decimal(car_tip["suggested_amount"]) == Decimal("500.00")
    withdraw_tip = next(i for i in items if i["category_id"] == standalone["id"])
    assert withdraw_tip["kind"] == "savings"
    assert Decimal(withdraw_tip["suggested_amount"]) == Decimal("-150.00")
    assert "savings" in withdraw_tip["message"]


def test_income_estimate_ignores_savings_schedule(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    fund = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "savings", "name": f"Emergency {uuid.uuid4().hex[:6]}"},
    )
    assert fund.status_code == 201, fund.text
    today = date.today()
    sched = client.post(
        "/api/recurring-schedules",
        headers=h,
        json={
            "category_id": fund.json()["id"],
            "amount": "800.00",
            "frequency": "monthly",
            "anchor_day": 1,
            "start_date": date(today.year, today.month, 1).isoformat(),
        },
    )
    assert sched.status_code == 201, sched.text
    est = client.get(
        "/api/recurring-schedules/income-estimate",
        headers=h,
        params={"year": today.year, "month": today.month},
    )
    assert est.status_code == 200, est.text
    body = est.json()
    assert Decimal(body["estimated_total"]) == Decimal("0.00")
    assert body["based_on_schedules"] == 0
    assert all(c["category_id"] != fund.json()["id"] for c in body["categories"])
