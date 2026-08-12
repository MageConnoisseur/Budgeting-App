# Budgeting App — Agent Instructions

Pass this file to new coding agents so they share the same product, architecture, and delivery context.

---

## 1. What this project is

A full-stack **personal budgeting app** with:

1. **Budget planner** — plan income, expenses, and savings by calendar month, with **monthly and annual** editing views
2. **Expense / transaction tracker** — log real money movement against those plan categories, with strong **search/sort**
3. **Dashboard** — analyze plan vs actual (monthly or annual), spot trends, and refine future budgets

**Clients:** Web app (primary for planning and analysis) and later a phone app (primary for on-the-go logging). Both use the **same API and database** so one user account stays in sync across devices.

**Not in scope for early versions:** bank sync, household sharing, multi-currency, or hard spending locks.

---

## 2. Product principles

- **Plan ≠ actual.** Budgets are planned amounts; transactions are what really happened. The dashboard compares them.
- **Do not force identical months.** Income and spending can change month to month.
- **Do not force re-entering everything.** New months are seeded from the previous plan; users edit only what changed.
- **Going over budget is allowed.** Soft visual warnings only — never block logging. Trends should make overspending obvious over time.
- **Savings are buckets with balances**, not just another expense line.
- **Web is robust and desktop-friendly**; mobile (phase 2) optimizes for fast transaction entry.
- **Monthly and annual views are first-class** on Budget and Dashboard — users can switch preference easily and edit in either mode.
- **Tracker must be easy to search and sort** so users can confirm whether something was already logged.
- **Start simple, design for growth** (better auth, CSV import, multi-currency, shared households later).

---

## 3. Core domains

### 3.1 Categories

Three category kinds:

| Kind | Purpose |
|------|---------|
| **Income** | Paychecks, side income, etc. |
| **Expense** | Spending categories (rent, groceries, dining, …) |
| **Savings** | Named **buckets** the user allocates money into |

Categories are user-defined. They persist across months; **monthly planned amounts** are per month.

### 3.2 Budget plan (monthly + annual views)

- Storage periods are **calendar months** for v1 (custom date ranges later).
- For each month + category: a **planned amount**.
- Currency for v1: **USD only** (multi-currency later).

#### View modes (required)

Budget (and Dashboard — see §3.5) must support **both**:

| View | Purpose |
|------|---------|
| **Monthly** | Focus on one month; edit that month’s planned amounts |
| **Annual** | See a full year (all 12 months × categories); edit cells in place and scan the year at once |

Requirements:

- Easy, persistent **toggle** (or equivalent control) to swap Monthly ↔ Annual without losing place.
- Remember the user’s last preferred view when practical (local or account preference).
- **Annual view is editable**, not read-only summary — changing a month/category cell updates that month’s planned amount.
- Annual layout should stay usable on desktop (grid/table of categories × months is the expected pattern).
- Underlying data stays **per-month budget lines**; annual view is a projection/editing surface over those months.
- Creating/editing cells in annual view for months that do not yet exist should create/seed those months using copy-forward rules where appropriate.

#### Copy-forward (required behavior)

When a user opens or creates a month that has no plan yet:

1. **Auto-seed** planned amounts from the **most recent prior month** that has a plan.
2. If no prior month exists, start empty (or from a saved template if one exists).
3. Also provide explicit actions:
   - **Copy from month…**
   - **Save as template**
   - **Apply template**

Only **planned amounts** copy — never transactions.

### 3.3 Savings buckets

Savings categories are **buckets** that accumulate:

- **Plan:** how much to contribute to the bucket this month
- **Actual:** transfers in/out logged in the tracker
- **Balance:** running total allocated to that bucket over time
- **Dashboard:** show balance, contribution progress vs plan, and history

### 3.4 Transaction tracker (manual for v1)

Users log transactions manually:

- Amount, date, optional note
- **Cascaded category pickers:**
  1. First dropdown: **Income / Expense / Savings**
  2. Second dropdown: categories of that kind

Transactions must reference an existing budget category (of the selected kind).

#### Search, sort, and find (required)

The tracker is also a **lookup tool** — users need to quickly check whether they already logged something.

MVP must include:

- **Search** across note text, category name, amount, and date (as appropriate)
- **Sorting** by date, amount, category, and kind (asc/desc)
- **Filters** at minimum: date range, kind (income / expense / savings), and category
- Clear empty states when nothing matches; easy reset of search/filters
- Performance-minded list UX as history grows (pagination or virtualized list is fine)

**CSV / bank import:** later. When designed, account for **duplicate detection** (manual entry then CSV of the same transactions). Do not implement import in MVP.

### 3.5 Dashboard (high priority, customizable)

Goal: help users **learn and adjust** spending and plans over time — not only “this month’s remaining dollars.”

#### View modes (required)

Same preference model as Budget:

- **Monthly view** — deep dive on the selected month (progress vs plan, remaining, over/under)
- **Annual view** — year-level insight across all months (totals, trends, which categories overrun repeatedly)
- Easy swap between Monthly ↔ Annual; remember preference when practical

Widgets should respect the active view (month-scoped vs year-scoped), not only duplicate the same chart with a different label.

v1 direction:

- **Customizable widgets / layout** the user can rearrange (primary ask)
- Progress vs plan for income, expenses, and savings
- **Month-to-month trends** (especially categories that are consistently over or under)
- Category drill-downs and filters as the widget set grows

Over-budget behavior: **soft warnings only**. Emphasize patterns across months so users can raise allocations where they repeatedly overrun.

---

## 4. Users & auth

| Topic | Decision |
|-------|----------|
| Audience | Individual accounts first; design data so **households/shared budgets** could be added later |
| Auth | Username + **email** + password, plus optional **Google / Facebook** OAuth |
| Account linking | Users can attach email and link social providers to an **existing** account so budget data is never split |
| Email verification | Not required yet (users should still enter a recoverable address) |
| Demo / local-only mode | Optional for early UI work; production path is real accounts against the API |

Do not build multi-user sharing in MVP, but avoid hard-coding assumptions that make “one budget, many members” impossible later (e.g. prefer `user_id` / future `workspace_id` ownership patterns).

---

## 5. Architecture & hosting

### 5.1 Stack (locked)

| Layer | Choice | Host |
|-------|--------|------|
| Database | **PostgreSQL** | **Neon** |
| API | **FastAPI (Python)** | **Render** |
| Web client | **React** (prefer **Vite + React SPA** unless a clear need for Next.js appears) | **Vercel** |
| Mobile (phase 2) | **Expo (React Native)**, Android first | App stores / EAS later |

**Single source of truth:** Neon via FastAPI. Web and mobile are clients only — no separate mobile database.

### 5.2 Why this shape

- Owner is most familiar with **React + FastAPI + Postgres**.
- API on Render keeps Python backend independent of the Vercel frontend.
- Vite SPA on Vercel is a natural fit when the API is external.
- Expo shares React skills and talks to the same API; **Expo Go** simplifies Android testing.
- **iOS later** via Expo EAS Build + Apple Developer account when needed (cloud builds reduce need for a local Mac).

### 5.3 Suggested repo layout (when scaffolding)

Prefer a monorepo once code exists, for example:

```text
/
  instructions.md          # this file
  api/                     # FastAPI → Render
  web/                     # React (Vite) → Vercel (top-level so hosts can pick Root Directory)
  mobile/                  # Expo → phase 2
  packages/                # optional shared types/utils later
```

Agents may adjust names, but keep **api / web / mobile** separation clear. Prefer top-level `web/` over nested `apps/web` so Vercel’s Root Directory dropdown lists it next to `api/`.

### 5.4 API expectations

- REST (or clear OpenAPI-documented HTTP) from FastAPI
- Auth-protected routes for user data
- CORS configured for the Vercel web origin (and later the mobile app)
- Migrations for Postgres schema (e.g. Alembic) — do not rely on ad-hoc manual schema edits for lasting changes
- Environment variables for `DATABASE_URL`, secrets, allowed origins — never commit secrets

---

## 6. Delivery phases

### Phase 1 — MVP (web + API)

Must include:

- [ ] Username + email + password auth, with optional Google/Facebook OAuth and account linking
- [ ] Category CRUD (income / expense / savings)
- [ ] Monthly budget plans with planned amounts
- [ ] Budget **Monthly ↔ Annual** view toggle (annual grid editable)
- [ ] Copy-forward auto-seed + copy/template actions
- [ ] Manual transaction tracker with cascaded dropdowns
- [ ] Tracker **search, sort, and filters** for finding past entries
- [ ] Dashboard with customizable insight widgets (start useful, extend over time)
- [ ] Dashboard **Monthly ↔ Annual** view toggle
- [ ] Soft over-budget indicators + month-to-month trend views

Out of scope for Phase 1:

- Native mobile app
- CSV / bank import
- Multi-currency
- Household sharing
- Hard spend limits
- Bank connections

### Phase 2 — Mobile

- Expo Android app against the same API
- Optimize for **quick transaction entry** on the go
- Budget/dashboard can be thinner than web at first
- iOS via EAS when ready

### Phase 3+ — Growth (do not build until asked)

- Email verification / password reset
- CSV import with duplicate safeguards
- Multi-currency
- Custom budget periods (non-calendar)
- Households / shared budgets
- Deeper dashboard analytics and suggestions

---

## 7. UX notes for agents

### Web

- Intuitive, robust **desktop** budgeting: clear month/year navigation, fast editing of planned amounts, obvious copy/template controls, and a prominent **Monthly / Annual** switch.
- Annual budget view: editable category × month grid suitable for scanning and bulk mental planning.
- Tracker: cascaded kind → category dropdowns; date + amount entry should be quick; **search/sort/filter** should make “did I already log X?” easy.
- Dashboard: prioritize clarity and customization; support the same **Monthly / Annual** preference as Budget.

### Mobile (when built)

- Fast path: open app → log transaction → done.
- Same categories and months as web; never fork business rules client-side.

### Design

- No fixed brand name yet — use a clear working product name in UI until one is chosen.
- Prefer a coherent visual system; avoid generic “AI slop” aesthetics when building marketing or polished UI surfaces.
- Accessibility basics: labels, keyboard use on web, sufficient contrast.

---

## 8. Data model sketch (guidance, not final schema)

Agents should refine this, but stay close to these concepts:

- **User** — username, email (required for password signup), password hash (nullable for OAuth-only), OAuth provider links, timestamps
- **Category** — user_id, kind (`income` | `expense` | `savings`), name, archived flag, sort order
- **BudgetMonth** — user_id, year, month (unique per user)
- **BudgetLine** — budget_month_id, category_id, planned_amount
- **BudgetTemplate** / **BudgetTemplateLine** — optional named defaults
- **Transaction** — user_id, category_id, amount, date, note, timestamps  
  (amount sign/convention should be consistent and documented in API)
- **SavingsBalance** — derived from transactions (prefer compute from ledger; materialize only if needed for performance)

All user-owned rows must be scoped by authenticated user.

---

## 9. Rules for coding agents

1. **Read this file first** before scaffolding or changing product behavior.
2. **Prefer Phase 1 scope.** Do not implement Phase 2/3 features unless the task explicitly asks.
3. **Keep one API contract** for all clients; avoid embedding business logic only in the web app.
4. **Preserve copy-forward semantics** when touching budget months.
5. **Budget and Dashboard must support Monthly and Annual views** with easy switching; annual budget view remains editable.
6. **Tracker must support solid search, sort, and filter** so users can find past entries.
7. **Savings = buckets with balances**; do not flatten them into normal expenses without discussion.
8. **Over-budget = soft warning**, never a hard block.
9. **USD-only** until multi-currency is explicitly requested — still keep amounts as proper decimal/money types, not floats.
10. **No secrets in git.** Use env vars for Neon, Render, and Vercel config.
11. **Migrate the database** deliberately; include migrations with schema changes.
12. **Ask before large product pivots** (e.g. switching to YNAB-style rollover, dropping FastAPI, or adding bank sync).
13. When uncertain, choose the option that keeps **web planning strong**, **logging simple**, and **dashboard insightful**.

---

## 10. Decision log (resolved)

| Topic | Decision |
|-------|----------|
| Month model | Copy-forward auto-seed from latest planned month + copy/template tools |
| Periods | Calendar months now; custom ranges later |
| Savings | Buckets with allocated balances + monthly contribution plans |
| Tracker | Manual transactions first; CSV later with dedup concerns |
| Over budget | Soft warnings; emphasize multi-month trends |
| Dashboard | Robust, customizable widgets; insight for future adjustments |
| Dashboard spending pace | Rolling ~30-day actuals vs average daily income (lookback ≤ ~6 months, clamped to first tracking day) — soft overspending signal that avoids mid-month paycheck skew |
| Budget / Dashboard views | Monthly and Annual modes; easy swap; annual budget editing allowed |
| Tracker findability | Search, sort, and filters required in MVP |
| Auth now | Username + email + password; Google/Facebook OAuth with explicit account linking |
| Auth later | Email verification, password reset |
| Users | Individual accounts; households later |
| Currency | USD now; multi-currency later |
| Mobile | Phase 2 Expo Android after web+API MVP; shared API/DB |
| Hosting | Neon (DB) + Render (API) + Vercel (web) |
| Stack | React web, FastAPI, PostgreSQL |

---

## 11. Open items (do not block MVP)

- Final product / brand name
- Exact dashboard widget set and persistence of layouts
- Whether Monthly/Annual view preference is stored per-user on the server or locally in the browser (either is fine for MVP; document the choice)
- Password hashing / session strategy details — JWT Bearer + bcrypt; OAuth via Google/Facebook documented in `api/README.md`
- Whether monorepo tooling (pnpm/npm workspaces, uv, etc.) is introduced at first scaffold

If an agent needs a choice among reasonable options for an open item, pick a conventional secure default, document it briefly in code/README, and continue.
