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
    email = f"{username}@example.com"
    r = client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_ready_ok() -> None:
    r = client.get("/health/ready")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok"


def test_users_schema_compatible_rejects_legacy_bigint() -> None:
    from sqlalchemy import create_engine, text

    from app.config import get_settings
    from app.migrate import drop_app_schema, users_schema_compatible

    engine = create_engine(get_settings().sqlalchemy_database_url)
    drop_app_schema(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE users (
                  id BIGSERIAL PRIMARY KEY,
                  username TEXT NOT NULL UNIQUE,
                  password_hash TEXT NOT NULL,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
    assert users_schema_compatible(engine) is False
    # Restore proper schema for later tests in this process.
    from app.migrate import main as migrate_main

    assert migrate_main() == 0
    assert users_schema_compatible(engine) is True


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
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "password123",
        },
    )
    assert register.status_code == 201, register.text
    assert register.headers.get("access-control-allow-origin") == origin


def test_register_login_and_me(auth_headers: dict[str, str]) -> None:
    r = client.get("/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["preferred_budget_view"] == "monthly"
    assert "username" in body
    assert body["email"]
    assert body["has_password"] is True
    assert body["oauth_providers"] == []


def test_register_requires_email() -> None:
    username = f"noemail_{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/auth/register",
        json={"username": username, "password": "password123"},
    )
    assert r.status_code == 422


def test_login_with_email() -> None:
    username = f"emaillogin_{uuid.uuid4().hex[:8]}"
    email = f"{username}@example.com"
    password = "password123"
    reg = client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )
    assert reg.status_code == 201, reg.text
    login = client.post(
        "/api/auth/login",
        json={"username": email, "password": password},
    )
    assert login.status_code == 200, login.text
    assert login.json()["access_token"]


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
    assert "spending_pace" in body
    assert body["spending_pace"]["has_data"] is True
    assert body["spending_pace"]["window_days"] >= 1
    assert Decimal(body["spending_pace"]["expense"]) >= Decimal("555.25")

    annual = client.get("/api/dashboard/annual/2026", headers=h)
    assert annual.status_code == 200
    assert len(annual.json()["months"]) == 12
    assert "spending_pace" in annual.json()
    assert "plan_suggestions" in annual.json()
    assert isinstance(annual.json()["plan_suggestions"], list)

    balances = client.get("/api/dashboard/savings-balances", headers=h)
    assert balances.status_code == 200
    vac = next(b for b in balances.json() if b["category_id"] == vacation["id"])
    assert Decimal(vac["balance"]) == Decimal("100.00")

    # Savings target + projected hit month on monthly dashboard
    target_patch = client.patch(
        f"/api/categories/{vacation['id']}",
        headers=h,
        json={"target_amount": "500.00"},
    )
    assert target_patch.status_code == 200, target_patch.text
    assert Decimal(target_patch.json()["target_amount"]) == Decimal("500.00")

    # Reject target on non-savings
    bad_target = client.patch(
        f"/api/categories/{groceries['id']}",
        headers=h,
        json={"target_amount": "100.00"},
    )
    assert bad_target.status_code == 400

    dash_target = client.get("/api/dashboard/monthly/2026/5", headers=h)
    assert dash_target.status_code == 200
    vac_bucket = next(
        b
        for b in dash_target.json()["savings_buckets"]
        if b["category_id"] == vacation["id"]
    )
    assert Decimal(vac_bucket["target_amount"]) == Decimal("500.00")
    assert vac_bucket["target_reached"] is False
    # Balance 100, need 400 more at $100/mo → 4 months → Aug 2026
    assert vac_bucket["projected_hit_year"] == 2026
    assert vac_bucket["projected_hit_month"] == 8
    assert Decimal(vac_bucket["monthly_contribution"]) == Decimal("100.00")

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
    widgets = got.json()["widgets"]
    ids = {w["id"] for w in widgets}
    assert "expense-progress" in ids
    # New default widgets (e.g. cashflow-trend, spending-pace) are appended for existing layouts.
    assert "cashflow-trend" in ids
    assert "spending-pace" in ids
    assert len(widgets) >= 1


def test_plan_suggestions_median_raise_and_apply(
    auth_headers: dict[str, str],
) -> None:
    """3+ spread overruns → median raise suggestion; annual cell applies it."""
    h = auth_headers
    dining = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "DiningOut"},
    ).json()
    cat_id = dining["id"]

    # Spread overruns in Jan, Apr, Jul (not a contiguous seasonal cluster).
    for month, planned, actual in (
        (1, "100.00", "130.00"),
        (2, "100.00", "90.00"),
        (4, "100.00", "150.00"),
        (5, "100.00", "80.00"),
        (7, "100.00", "140.00"),
        (8, "100.00", "70.00"),
    ):
        client.put(
            f"/api/budgets/months/2026/{month}",
            headers=h,
            json={"lines": [{"category_id": cat_id, "planned_amount": planned}]},
        )
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": cat_id,
                "amount": actual,
                "date": f"2026-{month:02d}-15",
                "note": f"Spend {month}",
            },
        )

    annual = client.get("/api/dashboard/annual/2026", headers=h)
    assert annual.status_code == 200, annual.text
    suggestions = annual.json()["plan_suggestions"]
    match = [s for s in suggestions if s["category_id"] == cat_id]
    assert len(match) == 1
    s = match[0]
    assert s["suggestion_kind"] == "median_raise"
    assert s["months_over"] == 3
    assert Decimal(s["median_overrun"]) == Decimal("40.00")
    assert s["apply_year"] == 2026
    if date.today().year == 2026:
        assert s["apply_month"] == date.today().month
    assert Decimal(s["suggested_planned"]) == Decimal(s["current_planned"]) + Decimal(
        "40.00"
    )

    applied = client.put(
        "/api/budgets/annual/cell",
        headers=h,
        json={
            "year": s["apply_year"],
            "month": s["apply_month"],
            "category_id": cat_id,
            "planned_amount": s["suggested_planned"],
        },
    )
    assert applied.status_code == 200, applied.text
    line = next(x for x in applied.json()["lines"] if x["category_id"] == cat_id)
    assert Decimal(line["planned_amount"]) == Decimal(s["suggested_planned"])


def test_plan_suggestions_seasonal_no_raise_cta(
    auth_headers: dict[str, str],
) -> None:
    h = auth_headers
    travel = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "TravelCluster"},
    ).json()
    cat_id = travel["id"]

    for month, planned, actual in (
        (1, "200.00", "150.00"),
        (2, "200.00", "180.00"),
        (6, "200.00", "260.00"),
        (7, "200.00", "280.00"),
        (8, "200.00", "250.00"),
        (9, "200.00", "190.00"),
    ):
        client.put(
            f"/api/budgets/months/2026/{month}",
            headers=h,
            json={"lines": [{"category_id": cat_id, "planned_amount": planned}]},
        )
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": cat_id,
                "amount": actual,
                "date": f"2026-{month:02d}-10",
                "note": f"Travel {month}",
            },
        )

    annual = client.get("/api/dashboard/annual/2026", headers=h)
    assert annual.status_code == 200
    match = [
        s
        for s in annual.json()["plan_suggestions"]
        if s["category_id"] == cat_id
    ]
    assert len(match) == 1
    assert match[0]["suggestion_kind"] == "seasonal"
    assert match[0]["suggested_planned"] is None
    assert "seasonal" in match[0]["message"].lower()


def test_spending_pace_uses_average_income_and_clamps_to_tracking_start(
    auth_headers: dict[str, str],
) -> None:
    """Pace compares rolling outflow to avg income; lookback starts at first tx."""
    h = auth_headers
    paycheck = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "income", "name": "Paycheck"},
    ).json()
    food = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Food"},
    ).json()

    # First tracking day is mid-month so the 30-day window clamps to it.
    assert (
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": paycheck["id"],
                "amount": "3000.00",
                "date": "2026-05-15",
                "note": "May pay",
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": food["id"],
                "amount": "200.00",
                "date": "2026-05-16",
                "note": "Groceries",
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/transactions",
            headers=h,
            json={
                "category_id": food["id"],
                "amount": "4000.00",
                "date": "2026-05-28",
                "note": "Big spend",
            },
        ).status_code
        == 201
    )

    dash = client.get("/api/dashboard/monthly/2026/5", headers=h)
    assert dash.status_code == 200, dash.text
    pace = dash.json()["spending_pace"]
    assert pace["has_data"] is True
    assert pace["tracking_started_on"] == "2026-05-15"
    assert pace["window_start"] == "2026-05-15"
    assert pace["window_end"] == "2026-05-31"
    assert pace["window_days"] == 17
    assert pace["income_lookback_start"] == "2026-05-15"
    assert pace["income_lookback_days"] == 17
    assert Decimal(pace["income"]) == Decimal("3000.00")
    assert Decimal(pace["expense"]) == Decimal("4200.00")
    assert Decimal(pace["outflow"]) == Decimal("4200.00")
    # Capacity for the clamped window equals total income in lookback ($3000).
    assert Decimal(pace["expected_income"]) == Decimal("3000.00")
    assert pace["overspending"] is True
    assert len(pace["days"]) == pace["window_days"]
    assert Decimal(pace["days"][-1]["cumulative_outflow"]) == Decimal("4200.00")


def test_category_rename_and_transaction_update(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    groceries = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Groceries"},
    )
    assert groceries.status_code == 201, groceries.text
    groceries_id = groceries.json()["id"]

    dining = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Dining"},
    )
    assert dining.status_code == 201, dining.text
    dining_id = dining.json()["id"]

    renamed = client.patch(
        f"/api/categories/{groceries_id}",
        headers=h,
        json={"name": "Food at Home"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Food at Home"

    # Duplicate name within the same kind should fail
    dup = client.patch(
        f"/api/categories/{dining_id}",
        headers=h,
        json={"name": "Food at Home"},
    )
    assert dup.status_code == 400

    created = client.post(
        "/api/transactions",
        headers=h,
        json={
            "category_id": groceries_id,
            "amount": "12.50",
            "date": "2026-06-01",
            "note": "typo amount",
        },
    )
    assert created.status_code == 201, created.text
    tx_id = created.json()["id"]

    updated = client.patch(
        f"/api/transactions/{tx_id}",
        headers=h,
        json={
            "category_id": dining_id,
            "amount": "18.75",
            "date": "2026-06-02",
            "note": "corrected lunch",
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["category_id"] == dining_id
    assert Decimal(body["amount"]) == Decimal("18.75")
    assert body["date"] == "2026-06-02"
    assert body["note"] == "corrected lunch"
    assert body["category"]["name"] == "Dining"

    # Clearing the note is supported
    cleared = client.patch(
        f"/api/transactions/{tx_id}",
        headers=h,
        json={"note": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["note"] is None


def test_note_suggestions(auth_headers: dict[str, str]) -> None:
    h = auth_headers
    groceries = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Groceries"},
    )
    assert groceries.status_code == 201, groceries.text
    groceries_id = groceries.json()["id"]

    rent_cat = client.post(
        "/api/categories",
        headers=h,
        json={"kind": "expense", "name": "Housing"},
    )
    assert rent_cat.status_code == 201, rent_cat.text
    housing_id = rent_cat.json()["id"]

    for payload in (
        {
            "category_id": groceries_id,
            "amount": "40.00",
            "date": "2026-07-01",
            "note": "Trader Joe's",
        },
        {
            "category_id": groceries_id,
            "amount": "55.25",
            "date": "2026-07-08",
            "note": " trader joe's ",
        },
        {
            "category_id": groceries_id,
            "amount": "12.00",
            "date": "2026-07-09",
            "note": "Costco",
        },
        {
            "category_id": housing_id,
            "amount": "1800.00",
            "date": "2026-07-01",
            "note": "rent",
        },
        {
            "category_id": housing_id,
            "amount": "1800.00",
            "date": "2026-08-01",
            "note": "Rent",
        },
        {
            "category_id": housing_id,
            "amount": "50.00",
            "date": "2026-07-15",
            "note": None,
        },
    ):
        r = client.post("/api/transactions", headers=h, json=payload)
        assert r.status_code == 201, r.text

    # Empty query returns frequent notes (blank notes excluded)
    top = client.get("/api/transactions/note-suggestions", headers=h)
    assert top.status_code == 200, top.text
    notes = [i["note"] for i in top.json()["items"]]
    assert len(notes) == 3
    assert notes[0].lower() in {"trader joe's", "rent"}
    assert all(n.strip() for n in notes)

    # Case-insensitive grouping + most recent casing/amount
    trader = client.get(
        "/api/transactions/note-suggestions",
        headers=h,
        params={"q": "trader"},
    )
    assert trader.status_code == 200, trader.text
    items = trader.json()["items"]
    assert len(items) == 1
    assert items[0]["note"].lower() == "trader joe's"
    assert items[0]["use_count"] == 2
    assert items[0]["last_date"] == "2026-07-08"
    assert Decimal(items[0]["last_amount"]) == Decimal("55.25")
    assert items[0]["last_category_id"] == groceries_id
    assert items[0]["last_kind"] == "expense"

    # Prefix with one character
    r_prefix = client.get(
        "/api/transactions/note-suggestions",
        headers=h,
        params={"q": "r"},
    )
    assert r_prefix.status_code == 200
    assert any(i["note"].lower() == "rent" for i in r_prefix.json()["items"])

    # Category preference boosts notes used with that category
    preferred = client.get(
        "/api/transactions/note-suggestions",
        headers=h,
        params={"category_id": housing_id},
    )
    assert preferred.status_code == 200
    preferred_notes = [i["note"].lower() for i in preferred.json()["items"]]
    assert preferred_notes[0] == "rent"

    missing = client.get(
        "/api/transactions/note-suggestions",
        headers=h,
        params={"category_id": str(uuid.uuid4())},
    )
    assert missing.status_code == 404


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


def _dev_oauth_callback(email: str, subject: str, *, intent: str = "login", token: str | None = None):
    """Drive the local dev OAuth provider through start → simulate → callback."""
    from urllib.parse import parse_qs, urlparse

    start_params: dict[str, str] = {"intent": intent}
    if intent == "link":
        assert token
        start_params["access_token"] = token
    start = client.get(
        f"/api/auth/oauth/dev/start",
        params=start_params,
        follow_redirects=False,
    )
    assert start.status_code in (302, 307), start.text
    sim_url = start.headers["location"]
    assert "/oauth/dev/simulate" in sim_url
    state = parse_qs(urlparse(sim_url).query)["state"][0]

    from app.services.oauth import ProviderProfile, encode_dev_code

    code = encode_dev_code(
        ProviderProfile(
            provider="dev",
            subject=subject,
            email=email,
            display_name="Dev User",
        )
    )
    callback = client.get(
        "/api/auth/oauth/dev/callback",
        params={"code": code, "state": state},
        follow_redirects=False,
    )
    assert callback.status_code in (302, 307), callback.text
    return callback.headers["location"]


def test_oauth_dev_login_creates_account_without_password() -> None:
    from urllib.parse import parse_qs, urlparse

    email = f"oauth_{uuid.uuid4().hex[:10]}@example.com"
    subject = f"subj_{uuid.uuid4().hex[:8]}"
    location = _dev_oauth_callback(email, subject)
    assert "/auth/callback" in location
    token = parse_qs(urlparse(location).query)["token"][0]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["email"] == email
    assert body["has_password"] is False
    assert "dev" in body["oauth_providers"]


def test_oauth_does_not_auto_merge_existing_email(auth_headers: dict[str, str]) -> None:
    from urllib.parse import parse_qs, urlparse

    me = client.get("/api/auth/me", headers=auth_headers)
    email = me.json()["email"]
    location = _dev_oauth_callback(email, f"other_{uuid.uuid4().hex[:8]}")
    assert "/login" in location
    qs = parse_qs(urlparse(location).query)
    assert qs["oauth_error"][0] == "account_exists"


def test_oauth_link_preserves_existing_user(auth_headers: dict[str, str]) -> None:
    from urllib.parse import parse_qs, urlparse

    token = auth_headers["Authorization"].split(" ", 1)[1]
    before = client.get("/api/auth/me", headers=auth_headers).json()
    subject = f"link_{uuid.uuid4().hex[:8]}"
    location = _dev_oauth_callback(
        f"linked_{uuid.uuid4().hex[:8]}@example.com",
        subject,
        intent="link",
        token=token,
    )
    assert "/auth/callback" in location
    qs = parse_qs(urlparse(location).query)
    assert qs.get("linked", [None])[0] == "dev"
    new_token = qs["token"][0]
    after = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {new_token}"}
    ).json()
    assert after["id"] == before["id"]
    assert after["username"] == before["username"]
    assert "dev" in after["oauth_providers"]
    # Original email is kept when the account already had one.
    assert after["email"] == before["email"]


def test_profile_email_update_and_unlink(auth_headers: dict[str, str]) -> None:
    from urllib.parse import parse_qs, urlparse

    token = auth_headers["Authorization"].split(" ", 1)[1]
    # Link provider first
    location = _dev_oauth_callback(
        f"extra_{uuid.uuid4().hex[:8]}@example.com",
        f"unlink_{uuid.uuid4().hex[:8]}",
        intent="link",
        token=token,
    )
    token = parse_qs(urlparse(location).query)["token"][0]
    headers = {"Authorization": f"Bearer {token}"}

    new_email = f"updated_{uuid.uuid4().hex[:8]}@example.com"
    upd = client.patch(
        "/api/auth/me/profile",
        headers=headers,
        json={"email": new_email},
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["email"] == new_email

    unlink = client.delete("/api/auth/oauth/dev", headers=headers)
    assert unlink.status_code == 200, unlink.text
    assert "dev" not in unlink.json()["oauth_providers"]
    assert unlink.json()["has_password"] is True
