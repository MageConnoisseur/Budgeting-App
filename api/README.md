"""
# Budgeting App API

FastAPI backend for the personal budgeting app (Phase 1 MVP).

Hosts on **Render**; database is **PostgreSQL on Neon**. Web (Vite/React on Vercel) and future mobile clients share this API.

## Features

- Username + password auth with **JWT Bearer** tokens
- Category CRUD (`income` / `expense` / `savings`)
- Monthly budget plans with **copy-forward** auto-seed
- Explicit **copy from month**, **save as template**, **apply template**
- **Annual** budget surface (`GET /api/budgets/annual/{year}`, `PUT /api/budgets/annual/cell`)
- Transactions with **search, sort, filters**, and pagination
- Dashboard monthly/annual insights with **soft** over-budget flags
- Savings bucket balances derived from the transaction ledger
- Persisted dashboard widget layouts + Monthly/Annual view preferences on the user

## Auth strategy

| Item | Choice |
|------|--------|
| Credentials | Username + password |
| Password hash | bcrypt (passlib) |
| Session | Stateless JWT (`Authorization: Bearer <token>`) |
| Token lifetime | 7 days (override with `ACCESS_TOKEN_EXPIRE_MINUTES`) |

Register or login returns `{ "access_token": "...", "token_type": "bearer" }`.

## Amount conventions (USD)

- Stored as `Numeric(14, 2)` / Decimal — never floats
- **Income / expense** transaction amounts must be **> 0**
- **Savings** amounts may be **positive** (contribution in) or **negative** (withdrawal out)
- Planned budget amounts are always **≥ 0**
- Going over budget is **allowed**; dashboard sets `over_budget: true` as a soft warning only

## Setup

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DATABASE_URL and SECRET_KEY
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

OpenAPI docs: http://localhost:8000/docs

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `SECRET_KEY` | yes (prod) | JWT signing secret |
| `CORS_ORIGINS` | no | Comma-separated allowed origins (default local Vite) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | JWT lifetime (default 10080) |

## Main routes

All data routes are under `/api` and require auth except `/api/auth/register` and `/api/auth/login`.

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me/preferences` |
| Categories | `GET/POST /categories`, `GET/PATCH/DELETE /categories/{id}` |
| Budgets | `GET/PUT /budgets/months/{year}/{month}`, `GET /budgets/annual/{year}`, `PUT /budgets/annual/cell`, copy/template actions |
| Transactions | `GET/POST /transactions`, `GET/PATCH/DELETE /transactions/{id}` (`q`, `kind`, `category_id`, `date_from`, `date_to`, `sort_by`, `sort_dir`) |
| Dashboard | `GET /dashboard/monthly/{year}/{month}`, `GET /dashboard/annual/{year}`, layout + savings balances |

## Migrations

```bash
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## Tests

```bash
cd api
source .venv/bin/activate
pytest -q
```

## Render deploy notes

- Root directory: `api`
- Build command: `pip install -r requirements.txt`
- Start command: `python -m alembic upgrade head && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Set `DATABASE_URL`, `SECRET_KEY`, and `CORS_ORIGINS` (your Vercel URL) in the Render dashboard
- Prefer `python -m uvicorn` / `python -m alembic` so Render’s PATH always finds the packages
