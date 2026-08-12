# Hearth Budgeting — Agent Instructions

Pass this file to new coding agents so they share the same product, architecture, and delivery context.

---

## 0. Current focus (read this first)

**Status:** Phase 1 MVP is **shipped** on `main` (web + API). Product name: **Hearth Budgeting**.

**What we are trying to accomplish now:** build a **very robust desktop web application** — the primary planning, tracking, and analysis surface. Depth and polish on `web/` + supporting `api/` work beat new clients or growth features.

| Phase | Name | Status |
|-------|------|--------|
| **Phase 1** | MVP (web + API) | **Done** |
| **Phase 1.x / v2** | **Desktop web depth** | **Active — prefer this scope** |
| **Phase 2** | Mobile (Expo) | **Deferred** until desktop web feels robust |
| **Phase 3+** | Growth (CSV, households, multi-currency, …) | Do not build until explicitly asked |

**Do not start Expo / `mobile/` or Phase 3+ work unless the task explicitly asks.** When uncertain, invest in desktop Budget, Tracker, Dashboard, Categories, and auth/account reliability.

---

## 1. What this project is

A full-stack **personal budgeting app** with:

1. **Budget planner** — plan income, expenses, and savings by calendar month, with **monthly and annual** editing views
2. **Expense / transaction tracker** — log real money movement against those plan categories, with strong **search/sort**
3. **Dashboard** — analyze plan vs actual (monthly or annual), spot trends, and refine future budgets

**Clients:** The **desktop web app is the product right now** (planning + analysis + full tracking). A phone app may come later for on-the-go logging. All clients use the **same API and database**.

**Not in scope until asked:** bank sync, household sharing, multi-currency, hard spending locks, native mobile, CSV/bank import.

---

## 2. Product principles

- **Plan ≠ actual.** Budgets are planned amounts; transactions are what really happened. The dashboard compares them.
- **Do not force identical months.** Income and spending can change month to month.
- **Do not force re-entering everything.** New months are seeded from the previous plan; users edit only what changed.
- **Going over budget is allowed.** Soft visual warnings only — never block logging. Trends should make overspending obvious over time.
- **Savings are buckets with balances**, not just another expense line.
- **Desktop web first.** Optimize for a dense, reliable, keyboard-friendly desktop experience. Responsive layouts are fine; do not sacrifice desktop power for a mobile-first redesign.
- **Monthly and annual views are first-class** on Budget and Dashboard — users can switch preference easily and edit in either mode.
- **Tracker must be easy to search and sort** so users can confirm whether something was already logged.
- **Ship depth before breadth.** Prefer making existing surfaces excellent over adding new product areas.

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

- Storage periods are **calendar months** (custom date ranges later).
- For each month + category: a **planned amount**.
- Currency: **USD only** until multi-currency is explicitly requested.

#### View modes (required)

Budget (and Dashboard — see §3.5) must support **both**:

| View | Purpose |
|------|---------|
| **Monthly** | Focus on one month; edit that month’s planned amounts |
| **Annual** | See a full year (all 12 months × categories); edit cells in place and scan the year at once |

Requirements:

- Easy, persistent **toggle** (or equivalent control) to swap Monthly ↔ Annual without losing place.
- Remember the user’s last preferred view (stored on the user record today).
- **Annual view is editable**, not read-only summary — changing a month/category cell updates that month’s planned amount.
- Annual layout should stay usable on **large desktop** screens (grid/table of categories × months is the expected pattern). Improving scanability, keyboard editing, and bulk mental planning is in-scope for desktop depth.
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
- **Target (optional):** goal amount on the bucket; dashboard projects the **hit month** from balance + monthly contribution rate
- **Dashboard:** show balance, contribution progress vs plan, target + projected hit month, and history

### 3.4 Transaction tracker (manual)

Users log transactions manually:

- Amount, date, optional note
- **Cascaded category pickers:**
  1. First dropdown: **Income / Expense / Savings**
  2. Second dropdown: categories of that kind
- **Note memory:** suggest prior notes (and related last-used context) to speed repeat entry

Transactions must reference an existing budget category (of the selected kind).

#### Search, sort, and find (required)

The tracker is also a **lookup tool** — users need to quickly check whether they already logged something.

Required:

- **Search** across note text, category name, amount, and date (as appropriate)
- **Sorting** by date, amount, category, and kind (asc/desc)
- **Filters** at minimum: date range, kind (income / expense / savings), and category
- Clear empty states when nothing matches; easy reset of search/filters
- Performance-minded list UX as history grows (pagination or virtualized list is fine)

**CSV / bank import:** Phase 3+. When designed, account for **duplicate detection** (manual entry then CSV of the same transactions).

### 3.5 Dashboard (high priority, customizable)

Goal: help users **learn and adjust** spending and plans over time — not only “this month’s remaining dollars.”

#### View modes (required)

Same preference model as Budget:

- **Monthly view** — deep dive on the selected month (progress vs plan, remaining, over/under)
- **Annual view** — year-level insight across all months (totals, trends, which categories overrun repeatedly)
- Easy swap between Monthly ↔ Annual; remember preference

Widgets should respect the active view (month-scoped vs year-scoped), not only duplicate the same chart with a different label.

Shipped / expected direction:

- **Customizable widgets / layout** the user can rearrange (deepen beyond simple reorder: hide/show, clearer controls as needed)
- Progress vs plan for income, expenses, and savings
- **Month-to-month trends** and readable plan-vs-actual visuals (including overlapping bars / major vs smaller bands where useful)
- **Spending pace:** rolling ~30-day actuals vs average daily income capacity (soft overspending signal)
- **Plan coaching:** after repeated expense/savings overruns, soft suggestions to raise plans (median overrun) or tip seasonal clusters; one-click apply via annual budget cell; dismissals may be local-only
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
| Session | JWT Bearer + bcrypt; details in `api/README.md` |
| Desktop depth | Password **reset / recovery** and other account reliability work are welcome in the active desktop phase when asked — do not wait for “mobile” |

Do not build multi-user sharing yet, but avoid hard-coding assumptions that make “one budget, many members” impossible later (e.g. prefer `user_id` / future `workspace_id` ownership patterns).

---

## 5. Architecture & hosting

### 5.1 Stack (locked)

| Layer | Choice | Host |
|-------|--------|------|
| Database | **PostgreSQL** | **Neon** |
| API | **FastAPI (Python)** | **Render** |
| Web client | **React** (**Vite + React SPA**) | **Vercel** |
| Mobile (later) | **Expo (React Native)**, Android first | App stores / EAS later |

**Single source of truth:** Neon via FastAPI. Web (and later mobile) are clients only — no separate client database.

### 5.2 Why this shape

- Owner is most familiar with **React + FastAPI + Postgres**.
- API on Render keeps Python backend independent of the Vercel frontend.
- Vite SPA on Vercel is a natural fit when the API is external.
- Expo remains the planned mobile approach **after** desktop web is robust; shared API keeps one source of truth.

### 5.3 Repo layout

```text
/
  instructions.md          # this file
  AGENTS.md                # points coding agents here
  api/                     # FastAPI → Render
  web/                     # React (Vite) → Vercel (Root Directory = web)
  mobile/                  # Expo → deferred (do not scaffold unless asked)
  packages/                # optional shared types/utils later
```

Keep **api / web / mobile** separation clear. Prefer top-level `web/` over nested `apps/web` so Vercel’s Root Directory dropdown lists it next to `api/`.

**Schema ownership:** Alembic migrations under `api/` are the source of truth. Do not introduce a parallel `database/tables.sql` apply path.

### 5.4 API expectations

- REST (OpenAPI-documented HTTP) from FastAPI
- Auth-protected routes for user data
- CORS configured for the Vercel web origin (and later the mobile app)
- Migrations for Postgres schema (Alembic) — do not rely on ad-hoc manual schema edits for lasting changes
- Environment variables for `DATABASE_URL`, secrets, allowed origins — never commit secrets

---

## 6. Delivery phases

### Phase 1 — MVP (web + API) — DONE

Shipped on `main`:

- [x] Username + email + password auth, with optional Google/Facebook OAuth and account linking
- [x] Category CRUD (income / expense / savings)
- [x] Monthly budget plans with planned amounts
- [x] Budget **Monthly ↔ Annual** view toggle (annual grid editable)
- [x] Copy-forward auto-seed + copy/template actions
- [x] Manual transaction tracker with cascaded dropdowns
- [x] Tracker **search, sort, and filters** for finding past entries
- [x] Dashboard with rearrangable insight widgets
- [x] Dashboard **Monthly ↔ Annual** view toggle
- [x] Soft over-budget indicators + month-to-month trend views
- [x] Spending pace widget; plan-raise coaching; tracker note memory; savings bucket guidance

Out of scope for Phase 1 (still out of scope unless asked):

- Native mobile app
- CSV / bank import
- Multi-currency
- Household sharing
- Hard spend limits
- Bank connections

### Phase 1.x / v2 — Desktop web depth (ACTIVE)

**Goal:** a **robust, desktop-first web app** people can rely on for real monthly budgeting — not a thin MVP shell.

Prioritize (order is guidance, not a rigid checklist):

1. **Desktop UX polish** — Budget monthly + annual editing fluency, Tracker findability/speed, Dashboard clarity and customization depth
2. **Categories & planning power** — sort order UI, archive/restore clarity, template/copy flows on both monthly and annual where useful
3. **Dashboard customization** — hide/show widgets, stronger layout controls, better annual vs monthly widget behavior
4. **Account reliability** — password reset/recovery, OAuth/prod auth hardening, safer migrations (no sharp legacy rebuild surprises on real data)
5. **Quality bar** — API tests kept green; add web smoke/E2E coverage for core flows; performance as data grows
6. **Visual coherence** — coherent desktop visual system under the **Hearth Budgeting** brand

**Explicitly not the active goal:** scaffolding Expo, App Store work, or Phase 3 growth features.

### Phase 2 — Mobile (DEFERRED)

Only after desktop web feels robust:

- Expo Android app against the same API
- Optimize for **quick transaction entry** on the go
- Budget/dashboard can be thinner than web at first
- iOS via EAS when ready

### Phase 3+ — Growth (do not build until asked)

- Email verification (beyond reset/recovery if still needed)
- CSV import with duplicate safeguards
- Multi-currency
- Custom budget periods (non-calendar)
- Households / shared budgets
- Deeper automated advice beyond soft plan coaching

---

## 7. UX notes for agents

### Web (primary product)

- Optimize for **desktop**: clear month/year navigation, fast editing of planned amounts, obvious copy/template controls, prominent **Monthly / Annual** switch, comfortable use of wide viewports.
- Annual budget view: editable category × month grid suitable for scanning and bulk mental planning; prefer density and clarity over mobile-style card stacks.
- Tracker: cascaded kind → category dropdowns; quick date + amount entry; note memory; **search/sort/filter** should make “did I already log X?” easy.
- Dashboard: clarity and customization; same **Monthly / Annual** preference as Budget; soft coaching and pace signals stay advisory.
- Keyboard support and accessibility basics matter on desktop (labels, focus, contrast).

### Mobile (when eventually built)

- Fast path: open app → log transaction → done.
- Same categories and months as web; never fork business rules client-side.

### Design

- Product name: **Hearth Budgeting** — use it in UI chrome, page titles, and user-facing copy.
- Prefer a coherent visual system; avoid generic “AI slop” aesthetics when polishing UI.
- Do not redesign the product as mobile-first while desktop depth is the active phase.

---

## 8. Data model sketch (guidance)

Stay close to these concepts (implemented under `api/` with Alembic):

- **User** — username, email (required for password signup), password hash (nullable for OAuth-only), OAuth provider links, view preferences, timestamps
- **Category** — user_id, kind (`income` | `expense` | `savings`), name, archived flag, sort order
- **BudgetMonth** — user_id, year, month (unique per user)
- **BudgetLine** — budget_month_id, category_id, planned_amount
- **BudgetTemplate** / **BudgetTemplateLine** — optional named defaults
- **Transaction** — user_id, category_id, amount, date, note, timestamps  
  (amount sign/convention documented in `api/README.md`)
- **DashboardLayout** — per-user widget order / layout for monthly vs annual
- **SavingsBalance** — derived from transactions (prefer compute from ledger; materialize only if needed for performance)

All user-owned rows must be scoped by authenticated user.

---

## 9. Rules for coding agents

1. **Read this file first** before changing product behavior.
2. **Prefer Phase 1.x / v2 desktop web depth.** Do not implement Phase 2 (mobile) or Phase 3+ features unless the task explicitly asks.
3. **Keep one API contract** for all clients; avoid embedding business logic only in the web app.
4. **Preserve copy-forward semantics** when touching budget months.
5. **Budget and Dashboard must support Monthly and Annual views** with easy switching; annual budget view remains editable.
6. **Tracker must support solid search, sort, and filter** so users can find past entries.
7. **Savings = buckets with balances**; do not flatten them into normal expenses without discussion.
8. **Over-budget = soft warning**, never a hard block. Plan coaching stays optional/advisory.
9. **USD-only** until multi-currency is explicitly requested — still keep amounts as proper decimal/money types, not floats.
10. **No secrets in git.** Use env vars for Neon, Render, and Vercel config.
11. **Migrate the database** deliberately with Alembic; do not add a parallel SQL-apply schema track.
12. **Ask before large product pivots** (e.g. switching to YNAB-style rollover, dropping FastAPI, adding bank sync, or starting mobile).
13. When uncertain, choose the option that keeps **desktop web planning strong**, **logging simple**, and **dashboard insightful**.

---

## 10. Decision log (resolved)

| Topic | Decision |
|-------|----------|
| Current product bet | **Desktop web depth (v2 / Phase 1.x)** — robust desktop app before mobile or growth features |
| Month model | Copy-forward auto-seed from latest planned month + copy/template tools |
| Periods | Calendar months now; custom ranges later |
| Savings | Buckets with allocated balances, optional target goals + projected hit month, and monthly contribution plans |
| Tracker | Manual transactions first; note memory autocomplete; CSV later with dedup concerns |
| Over budget | Soft warnings; emphasize multi-month trends |
| Plan coaching | After 3+ expense/savings overruns in a year: suggest raising the apply-month plan by the median overrun, or tip “looks seasonal” for a short contiguous cluster; one-click apply via annual budget cell; dismissals local-only |
| Dashboard | Robust, customizable widgets; insight for future adjustments |
| Dashboard spending pace | Rolling ~30-day actuals vs average daily income capacity (lookback ≤ ~6 months, clamped to first tracking day) — soft overspending signal that avoids mid-month paycheck skew |
| Budget / Dashboard views | Monthly and Annual modes; easy swap; annual budget editing allowed; preferences stored on the user |
| Tracker findability | Search, sort, and filters required |
| Auth now | Username + email + password; Google/Facebook OAuth with explicit account linking; JWT Bearer + bcrypt |
| Auth later / desktop depth | Password reset/recovery welcome in active phase when requested; email verification still later |
| Users | Individual accounts; households later |
| Currency | USD now; multi-currency later |
| Mobile | **Deferred** Expo Android until desktop web is robust; shared API/DB |
| Schema | Alembic under `api/` is source of truth (not a separate `database/` SQL apply tree) |
| Hosting | Neon (DB) + Render (API) + Vercel (web) |
| Stack | React (Vite) web, FastAPI, PostgreSQL |
| Product name | **Hearth Budgeting** |

---

## 11. Open items (do not block desktop depth)

- Exact dashboard widget set evolution and richer layout persistence (hide/show, denser controls)
- Whether plan-suggestion dismissals stay local-only or move server-side
- Monorepo tooling (pnpm/npm workspaces, uv, etc.) — optional; not required to keep shipping

If an agent needs a choice among reasonable options for an open item, pick a conventional secure default, document it briefly in code/README, and continue.
