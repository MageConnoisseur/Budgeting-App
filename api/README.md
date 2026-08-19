"""
# Hearth Budgeting API

FastAPI backend for Hearth Budgeting (desktop web + shared API).

Hosts on **Render**; database is **PostgreSQL on Neon**. Web (Vite/React on Vercel) and future mobile clients share this API.

## Features

- Username + password auth with **JWT Bearer** tokens
- Password **reset / recovery** (email link) plus change/set password on Account
- Category CRUD (`income` / `expense` / `savings`)
- Monthly budget plans with **copy-forward** auto-seed
- Explicit **copy from month**, **save as template**, **apply template**
- **Annual** budget surface (`GET /api/budgets/annual/{year}`, `PUT /api/budgets/annual/cell`)
- Transactions with **search, sort, filters**, and pagination
- **Recurring schedules** for payday / regular expense tracking reminders (manual log/skip)
- **Income estimate** for a month from tracker patterns + schedules
- Dashboard monthly/annual insights with **soft** over-budget flags
- **Spending pace** widget: rolling ~30-day actuals vs average income capacity
- **Budget coach:** leftover allocation, plan shortfall, savings-target funding, and existing plan-raise tips (deterministic; apply is optional)
- Savings bucket balances derived from the transaction ledger
- Optional savings **targets** with projected hit month from balance + monthly contribution
- Persisted dashboard widget layouts + Monthly/Annual view preferences on the user

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
| `CORS_ORIGINS` | no | Comma-separated allowed origins (default local Vite). `*.vercel.app` is also allowed automatically. |
| `FRONTEND_URL` | no | Web app origin for OAuth redirects (default `http://localhost:5173`) |
| `API_PUBLIC_URL` | no | Public API origin used as OAuth redirect_uri base (default `http://localhost:8000`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enable Google sign-in |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | no | Enable Facebook sign-in |
| `OAUTH_DEV_MODE` | no | Expose local `dev` OAuth provider for tests (default false) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | JWT lifetime (default 10080) |
| `PASSWORD_RESET_EXPIRE_MINUTES` | no | Reset link lifetime (default 60) |
| `RESEND_API_KEY` | prod (for reset mail) | Resend API key. Unset = log-only (dev/tests) |
| `RESEND_FROM` | with the API key | From header, e.g. `Hearth Budgeting <noreply@yourdomain.com>` |

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
- `python -m app.migrate` upgrades Alembic, stamps compatible existing schemas, or **rebuilds** if it detects the legacy `database/tables.sql` schema (BIGSERIAL ids) that breaks registration
- Check `GET /health/ready` — should return `{"status":"ok"}`. `schema_mismatch` means migrate did not repair yet.
- `GET /health` includes `"email": "resend"` when Resend is configured, or `"log_only"` when it is not

### Password reset email (Resend)

Forgot password is the only mail this API sends. Sign-up does **not** send a verification email — the form asks people to type the address twice.

You do **not** need to buy a domain for this yet. A `*.vercel.app` URL is fine for the *website and reset links*. It cannot be used as the *From* address (you cannot add SPF/DKIM on Vercel’s domain).

**No custom domain (you + your own inbox)**

Resend lets you send from `onboarding@resend.dev` to **only the email address on your Resend account**. That is enough while Hearth is just for you.

1. Open [resend.com/api-keys](https://resend.com/api-keys) and create a **Sending access** key. Copy it once (`re_…`). Skip [Domains](https://resend.com/domains) for now.
2. In Hearth **Account**, set the recovery email to the **same address you use to log into Resend** (otherwise Resend will refuse the send with a 403).
3. On the Render API service, set:

| Key | Value |
|-----|--------|
| `RESEND_API_KEY` | the `re_…` key |
| `RESEND_FROM` | `Hearth Budgeting <onboarding@resend.dev>` |
| `FRONTEND_URL` | your live Vercel URL, e.g. `https://your-app.vercel.app` (no trailing slash) |

4. Redeploy, then open `https://<render-host>/health` — you want `"email": "resend"`.
5. Use Forgot password on that same inbox. Check Resend → Emails, then the inbox. The link should open your Vercel app.

When you later buy a domain, verify it in Resend, then change `RESEND_FROM` to something like `Hearth Budgeting <noreply@yourdomain.com>`. Reset mail can then reach any user, not only your Resend login.

**After you have a domain**

1. Open [resend.com/domains](https://resend.com/domains), add the domain, and finish DNS (SPF, DKIM). If the domain’s DNS lives in Vercel, Resend’s Auto Configure can add the records.
2. Set `RESEND_FROM` to an address on that domain.
3. `FRONTEND_URL` can stay on `*.vercel.app` until you point a custom domain at the web app.

