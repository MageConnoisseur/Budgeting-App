"""
# Setaside API

FastAPI backend for Setaside (desktop web + shared API).

Hosts on **Render**; database is **PostgreSQL on Neon**. Web (Vite/React on Vercel) and the thin Expo expense-logging client (`mobile/`) share this API.

## Features

- Username + password auth with **JWT Bearer** tokens
- Password **reset / recovery** (email link) plus change/set password on Account
- Category CRUD (`income` / `expense` / `savings`)
- Monthly budget plans with **copy-forward** auto-seed
- Explicit **copy from month**, **save as template**, **apply template**
- **Annual** budget surface (`GET /api/budgets/annual/{year}`, `PUT /api/budgets/annual/cell`)
- Compact yearly actuals for budget-cell fills (`GET /api/budgets/actuals/{year}`)
- Transactions with **search, sort, filters**, and pagination
- **Recurring schedules** for payday / regular expense tracking reminders (manual log/skip)
- **Income estimate** for a month from tracker patterns + schedules
- Dashboard monthly/annual insights with **soft** over-budget flags
- **Spending pace** widget: rolling ~30-day actuals vs average income capacity
- **Budget coach:** leftover allocation, plan shortfall, savings-target funding, and existing plan-raise tips (deterministic; apply is optional)
- Savings bucket balances derived from the transaction ledger
- Optional savings **targets** with projected hit month from balance + monthly contribution
- Persisted dashboard widget layouts + Monthly/Annual view preferences on the user
- Default habit views (**This month/year**, **Fix the plan**, **Savings**) merged onto existing layouts without overwriting a custom page

## Auth strategy

| Item | Choice |
|------|--------|
| Password accounts | Username + **email** + password (email required on signup) |
| Social login | Google and Facebook OAuth (optional env credentials) |
| Account linking | Explicit link from Account settings — never auto-merge on email alone |
| Password recovery | Forgot-password email via **Resend** (one-hour one-time link); Account can change or set a password |
| Recovery email | Required for password signup. No verification email — sign-up asks people to type it twice. Sign-in is not gated on confirming the address. |
| Password hash | bcrypt (passlib) |
| Session | Stateless JWT (`Authorization: Bearer <token>`) |
| Token lifetime | 7 days (override with `ACCESS_TOKEN_EXPIRE_MINUTES`) |

Register or login returns `{ "access_token": "...", "token_type": "bearer" }`.
Login accepts **username or email**.

OAuth flow: browser hits `/api/auth/oauth/{provider}/start` → provider →
`/api/auth/oauth/{provider}/callback` → redirect to `{FRONTEND_URL}/auth/callback?token=…`.

If a social email already belongs to an existing password account, OAuth login is
refused with `account_exists`; the user signs in with their password and links
the provider from **Account** so budget data stays on one user id.

## Amount conventions (USD)

- Stored as `Numeric(14, 2)` / Decimal — never floats
- **Income / expense** transaction amounts must be **> 0**
- **Savings** amounts may be **positive** (contribution in) or **negative** (withdrawal out)
- An expense budget line may be **paid from** a savings bucket (`funded_by_category_id`); planned contributions stay **≥ 0**
- Paycheck leftover is **income − expenses paid from income − savings contributions** (funded expenses are visible but excluded)
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
| `CORS_ORIGINS` | no | Comma-separated allowed origins (default local Vite + Expo web on `:8081`). `*.vercel.app` is also allowed automatically. Native Android/iOS do not use CORS. |
| `FRONTEND_URL` | no | Web app origin for OAuth redirects (default `http://localhost:5173`) |
| `API_PUBLIC_URL` | no | Public API origin used as OAuth redirect_uri base (default `http://localhost:8000`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enable Google sign-in |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | no | Enable Facebook sign-in |
| `OAUTH_DEV_MODE` | no | Expose local `dev` OAuth provider for tests (default false) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | JWT lifetime (default 10080) |
| `PASSWORD_RESET_EXPIRE_MINUTES` | no | Reset link lifetime (default 60) |
| `RESEND_API_KEY` | prod (for reset mail) | Resend API key. Unset = log-only (dev/tests) |
| `RESEND_FROM` | with the API key | From header, e.g. `Setaside <noreply@setasideplan.com>` |

## Main routes

All data routes are under `/api` and require auth except `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`, and OAuth start/callback routes.

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me/preferences`, `PATCH /auth/me/profile`, `PATCH /auth/me/password` |
| Recovery | `POST /auth/forgot-password`, `GET/POST /auth/reset-password` |
| OAuth | `GET /auth/oauth/providers`, `GET /auth/oauth/{provider}/start`, `GET /auth/oauth/{provider}/callback`, `DELETE /auth/oauth/{provider}` |
| Categories | `GET/POST /categories`, `GET/PATCH/DELETE /categories/{id}` |
| Budgets | `GET/PUT /budgets/months/{year}/{month}`, `GET /budgets/annual/{year}`, `PUT /budgets/annual/cell`, copy/template actions |
| Transactions | `GET/POST /transactions`, `GET/PATCH/DELETE /transactions/{id}` (`q`, `kind`, `category_id`, `date_from`, `date_to`, `sort_by`, `sort_dir`) |
| Recurring | `GET/POST /recurring-schedules`, due/log/skip, `GET /recurring-schedules/suggestions`, `GET /recurring-schedules/income-estimate` |
| Dashboard | `GET /dashboard/monthly/{year}/{month}`, `GET /dashboard/annual/{year}`, layout + savings balances |

## Migrations

```bash
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

Deploy (`python -m app.migrate`) is meant to be **boring** on real data:

- Empty database → `alembic upgrade head`
- Versioned compatible schema → `upgrade head` (never a hardcoded revision)
- Compatible schema missing `alembic_version` → stamp the revision the live tables actually match, **then** upgrade. It does not stamp `head` blindly (that skipped later additive migrations).
- Legacy `database/tables.sql` leftovers (BIGSERIAL `users.id`, no preference columns) are rebuilt **only** when the `users` table is empty, or when `ALLOW_LEGACY_SCHEMA_REBUILD=true`. Populated production databases are refused with a clear error instead of being dropped.
- Optional `DATABASE_URL_DIRECT` (non-pooled Neon URL) is used for DDL when set.

`GET /health/ready` should return `{"status":"ok"}`. `schema_mismatch` means the live `users` table is not UUID-based.

## Tests

```bash
cd api
source .venv/bin/activate
pytest -q
```

## Render deploy notes

- Root directory: `api`
- Build command: `pip install -r requirements.txt`
- Start command: `python -m app.migrate && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Set `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS` (your Vercel URL), `FRONTEND_URL`, and `API_PUBLIC_URL` in the Render dashboard
- To enable social login, also set Google and/or Facebook OAuth credentials; redirect URIs must use `API_PUBLIC_URL`
- To send password-reset emails, set `RESEND_API_KEY` and `RESEND_FROM` (see below). `FRONTEND_URL` is used in reset links — it must be the live Vercel origin, not localhost
- Prefer `python -m uvicorn` so Render’s PATH always finds the package
- `python -m app.migrate` upgrades Alembic. It stamps a missing version row to the revision the live schema actually matches (not blindly to `head`), and it will **not** drop a populated production database. Legacy `database/tables.sql` rebuilds require an empty `users` table or `ALLOW_LEGACY_SCHEMA_REBUILD=true`.
- Check `GET /health/ready` — should return `{"status":"ok"}`. `schema_mismatch` means migrate did not repair yet.
- `GET /health` includes `"email": "resend"` when Resend is configured, or `"log_only"` when it is not

### Password reset email (Resend)

Forgot password is the only mail this API sends. Sign-up does **not** send a verification email — the form asks people to type the address twice.

**1. Resend dashboard**

1. Open [resend.com/domains](https://resend.com/domains). Add the domain you already use for ondeck (or a new one) and finish DNS (SPF, DKIM, optionally DMARC).
2. Add a from-address on that domain, e.g. `Setaside <noreply@setasideplan.com>`. Reusing the ondeck domain with a different local-part is fine.
3. Open [resend.com/api-keys](https://resend.com/api-keys) and create a **Sending access** key. Copy it once (`re_…`).
4. Optional smoke test: Resend’s `onboarding@resend.dev` from-address can only send to *your* Resend account email. Production users need the verified domain.

**2. Render (API service)**

Environment → Add:

| Key | Value |
|-----|--------|
| `RESEND_API_KEY` | the `re_…` key |
| `RESEND_FROM` | `Setaside <noreply@setasideplan.com>` (must match the verified domain) |
| `FRONTEND_URL` | the live Vercel origin, e.g. `https://your-app.vercel.app` (no trailing slash) |

Save and wait for the service to redeploy. Then `GET https://<render-host>/health` should show `"email": "resend"`.

**3. Confirm it works**

Request a password reset for your own account. The message should appear in Resend → Emails, then in the inbox. The link host must be your Vercel URL, not `localhost`.

