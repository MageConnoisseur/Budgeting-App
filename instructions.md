# Setaside — Agent Instructions

Pass this file to new coding agents so they share the same product, architecture, and delivery context.

---

## 0. Current focus (read this first)

**Status:** Phase 1 MVP is **shipped** on `main` (web + API). Product name: **Setaside**.

**What we are trying to accomplish now:** build a **very robust desktop web application** — the primary planning, tracking, and analysis surface. Depth and polish on `web/` + supporting `api/` work beat new clients or growth features.

| Phase | Name | Status |
|-------|------|--------|
| **Phase 1** | MVP (web + API) | **Done** |
| **Phase 1.x / v2** | **Desktop web depth** | **Active — prefer this scope** |
| **Phase 2** | Mobile (Expo) | **Deferred** until desktop web feels robust |
| **Phase 3+** | Growth (CSV, households, multi-currency, …) | Do not build until explicitly asked. CSV/bank import **design** is in §12 |

**Do not start Expo / `mobile/` or Phase 3+ work unless the task explicitly asks.** When uncertain, invest in desktop Budget, Tracker, Dashboard, Categories, and auth/account reliability.

---

## 1. What this project is

A full-stack **personal budgeting app** with:

1. **Budget planner** — plan income, expenses, and savings by calendar month, with **monthly and annual** editing views
2. **Expense / transaction tracker** — log real money movement against those plan categories, with strong **search/sort**
3. **Dashboard** — analyze plan vs actual (monthly or annual), spot trends, and refine future budgets

**Clients:** The **desktop web app is the product right now** (planning + analysis + full tracking). A phone app may come later for on-the-go logging. All clients use the **same API and database**.

**Not in scope until asked:** bank sync, household sharing, multi-currency, hard spending locks, native mobile, CSV/bank import. Intended import design (inbox, dedup, categorization, cost) is in **§12** — do not build it unless explicitly asked.

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
- Planned-amount cells show a **kind-colored actuals fill** (income green, expense pink/red, savings blue) so the grid itself shows how close logged actuals are to the plan — especially useful in annual view when setting next month from last month’s spend. Hover for the dollars; do not add extra numbers on the page.
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

- **Plan:** how much to contribute to the bucket this month (always ≥ 0)
- **Paid from (expenses):** an expense line may be marked **paid from** a savings bucket for that month. That is the planned *use* of the bucket — not a negative contribution. Paycheck leftover is `income − expenses paid from this month’s income − savings contributions`. Funded expenses stay visible on the budget but do not make the month look overcommitted.
- **Actual:** transfers in/out logged in the tracker. Logging an expense that is paid from a bucket should also withdraw from that bucket (paired entries).
- **Balance:** running total allocated to that bucket over time
- **Target (optional):** goal amount on the bucket; dashboard projects the **hit month** from balance + monthly contribution rate
- **Dashboard:** show balance, contribution progress vs plan, planned use, target + projected hit month, and history
- **Copy-forward:** auto-seed copies contribution amounts only — not “paid from” links — so a one-off shop month is not repeated. Explicit **Copy from month** and templates do copy the links.

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

**CSV / bank import:** Phase 3+. Do not write imports straight into the tracker. Intended design (review inbox, fingerprints, rounding-aware fuzzy match, merchant rules, bank sync as a later feed) is in **§12**. Until then, tracker search/sort is the mitigation for “did I already log this?”

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
- **Budget coach:** deterministic leftover / shortfall / savings-target recommendations (monthly and annual). Shortfall tips skip rent/mortgage-like fixed costs. Income under-plan is overrun only after paydays (or the month) are due. Optional one-click apply; dedicated Coach page plus a compact Dashboard widget. Not an LLM — dollar amounts come from the user’s plan.
- Category drill-downs and filters as the widget set grows

Over-budget behavior: **soft warnings only**. Emphasize patterns across months so users can raise allocations where they repeatedly overrun.

---

## 4. Users & auth

| Topic | Decision |
|-------|----------|
| Audience | Individual accounts first; design data so **households/shared budgets** could be added later |
| Auth | Username + **email** + password, plus optional **Google / Facebook** OAuth |
| Account linking | Users can attach email and link social providers to an **existing** account so budget data is never split |
| Email verification | Not required. Sign-up reminds people to type the recovery email carefully (confirm field). Password reset is sent via **Resend**. |
| Session | JWT Bearer + bcrypt; details in `api/README.md` |
| Desktop depth | Password **reset / recovery** (forgot-password email via Resend, change/set password) is in scope for the active desktop phase |

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
- [x] Deterministic budget coach (leftover allocation, shortfall, savings-target funding) with Coach page + dashboard widget

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
4. **Account reliability** — password reset/recovery (**shipped**: forgot/reset via Resend, change/set password, signup recovery-email reminder), OAuth/prod auth hardening, safer migrations (no sharp legacy rebuild surprises on real data)
5. **Quality bar** — API tests kept green; add web smoke/E2E coverage for core flows; performance as data grows
6. **Visual coherence** — coherent desktop visual system under the **Setaside** brand

Coach depth that stays **rule-based** (clearer copy, more apply actions, dismissal persistence) is in-scope. A conversational LLM coach is **not** the active goal.

**Explicitly not the active goal:** scaffolding Expo, App Store work, or Phase 3 growth features.

### Phase 2 — Mobile (DEFERRED)

Only after desktop web feels robust:

- Expo Android app against the same API
- Optimize for **quick transaction entry** on the go
- Budget/dashboard can be thinner than web at first
- iOS via EAS when ready

### Phase 3+ — Growth (do not build until asked)

- Email verification (beyond reset/recovery if still needed)
- CSV import with duplicate safeguards (see **§12**; inbox first, not silent insert)
- Bank / card sync as a later feed into that same inbox (see **§12**; ask before adding an aggregator)
- Multi-currency
- Custom budget periods (non-calendar)
- Households / shared budgets
- Conversational / LLM “AI coach” (must sit **on top of** the deterministic coach engine — never invent planned amounts; see decision log)

---

## 7. UX notes for agents

### Web (primary product)

- Optimize for **desktop**: clear month/year navigation, fast editing of planned amounts, obvious copy/template controls, prominent **Monthly / Annual** switch, comfortable use of wide viewports.
- Annual budget view: editable category × month grid suitable for scanning and bulk mental planning; prefer density and clarity over mobile-style card stacks.
- Tracker: cascaded kind → category dropdowns; quick date + amount entry; note memory; **search/sort/filter** should make “did I already log X?” easy.
- Dashboard: clarity and customization; same **Monthly / Annual** preference as Budget; soft coaching, leftover allocation tips, and pace signals stay advisory.
- Coach: first-class desktop page for plan-balance advice; compact widget on Dashboard. Stay advisory; do not add a chat UI unless Phase 3+ LLM work is explicitly requested.
- Keyboard support and accessibility basics matter on desktop (labels, focus, contrast).

### Mobile (when eventually built)

- Fast path: open app → log transaction → done.
- Same categories and months as web; never fork business rules client-side.

### Design

- Product name: **Setaside** — use it in UI chrome, page titles, and user-facing copy. Public site: setasideplan.com.
- Prefer a coherent visual system; avoid generic “AI slop” aesthetics when polishing UI.
- Do not redesign the product as mobile-first while desktop depth is the active phase.

---

## 8. Data model sketch (guidance)

Stay close to these concepts (implemented under `api/` with Alembic):

- **User** — username, email (required for password signup), password hash (nullable for OAuth-only), OAuth provider links, view preferences, optional `email_verified_at`, timestamps
- **Category** — user_id, kind (`income` | `expense` | `savings`), name, archived flag, sort order
- **BudgetMonth** — user_id, year, month (unique per user)
- **BudgetLine** — budget_month_id, category_id, planned_amount
- **BudgetTemplate** / **BudgetTemplateLine** — optional named defaults
- **Transaction** — user_id, category_id, amount, date, note, timestamps  
  (amount sign/convention documented in `api/README.md`)
- **DashboardLayout** — per-user widget order / layout for monthly vs annual
- **SavingsBalance** — derived from transactions (prefer compute from ledger; materialize only if needed for performance)
- **Import (Phase 3+, not built):** staging candidates, fingerprints, merchant rules, optional account/transfer rows — see **§12**. Do not add these tables unless that work is explicitly requested.

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
8. **Over-budget = soft warning**, never a hard block. Plan coaching and the budget coach stay optional/advisory. The coach must not prescribe a generic 50/30/20 split; it assigns leftover using the user’s categories and savings targets.
9. **USD-only** until multi-currency is explicitly requested — still keep amounts as proper decimal/money types, not floats.
10. **No secrets in git.** Use env vars for Neon, Render, and Vercel config.
11. **Migrate the database** deliberately with Alembic; do not add a parallel SQL-apply schema track.
12. **Ask before large product pivots** (e.g. switching to YNAB-style rollover, dropping FastAPI, adding bank sync, or starting mobile). If import/bank sync is explicitly requested, follow **§12** rather than inventing a parallel design.
13. When uncertain, choose the option that keeps **desktop web planning strong**, **logging simple**, and **dashboard insightful**.

---

## 10. Decision log (resolved)

| Topic | Decision |
|-------|----------|
| Current product bet | **Desktop web depth (v2 / Phase 1.x)** — robust desktop app before mobile or growth features |
| Month model | Copy-forward auto-seed from latest planned month + copy/template tools |
| Periods | Calendar months now; custom ranges later |
| Savings | Buckets with allocated balances, optional target goals + projected hit month, and monthly contribution plans. Expense lines may be **paid from** a bucket for a given month (planned use). Auto-seed does not copy those links; copy-from and templates do. Paycheck leftover ignores funded expenses. |
| Tracker | Manual transactions first; note memory autocomplete; CSV/bank import later per **§12** (inbox, fingerprints, rounding-aware fuzzy match, merchant rules) |
| CSV / bank import | **Phase 3+, not built.** Staging inbox (not silent ledger insert); fingerprints; rounding-aware fuzzy match (±$1 default); merge keeps category / note / paid-from and replaces rounded amount with posted; merchant rules from history; bank sync is a later feed into the same inbox; hosted aggregator billing is per institution login — see **§12** |
| Over budget | Soft warnings; emphasize multi-month trends |
| Plan coaching | After 3+ expense/savings overruns in a year: suggest raising the apply-month plan by the median overrun, or tip “looks seasonal” for a short contiguous cluster; one-click apply via annual budget cell; dismissals local-only |
| Budget coach | Deterministic leftover coach (Phase 1.x): unassigned plan leftover → fund a savings bucket (prefer unmet targets); plan shortfall → optional trim of **flexible** spend (skip rent/mortgage/dominant housing-sized lines); income under-plan is only flagged after paydays or the month are due; plus existing raise/seasonal tips and spending-pace warnings. Dedicated **Coach** page + compact Dashboard widget. Apply is optional; dismissals local-only. |
| AI / LLM coach | **Later (Phase 3+), not now.** If added, it must wrap the deterministic engine (explain tips, answer “why”) and must not invent dollar amounts or bypass soft-advisory rules. No API-key LLM in the current desktop-depth phase. |
| Dashboard | Robust, customizable widgets; insight for future adjustments |
| Dashboard spending pace | Rolling ~30-day actuals vs average daily income capacity (lookback ≤ ~6 months, clamped to first tracking day) — soft overspending signal that avoids mid-month paycheck skew |
| Budget / Dashboard views | Monthly and Annual modes; easy swap; annual budget editing allowed; preferences stored on the user |
| Tracker findability | Search, sort, and filters required |
| Auth now | Username + email + password; Google/Facebook OAuth with explicit account linking; JWT Bearer + bcrypt |
| Auth later / desktop depth | Password reset/recovery **shipped** (Resend forgot-password email, change/set password). Email verification is not required to sign in |
| Users | Individual accounts; households later |
| Currency | USD now; multi-currency later |
| Mobile | **Deferred** Expo Android until desktop web is robust; shared API/DB |
| Schema | Alembic under `api/` is source of truth (not a separate `database/` SQL apply tree) |
| Hosting | Neon (DB) + Render (API) + Vercel (web) |
| Stack | React (Vite) web, FastAPI, PostgreSQL |
| Product name | **Setaside** (setasideplan.com) |

---

## 11. Open items (do not block desktop depth)

- Exact dashboard widget set evolution and richer layout persistence (hide/show, denser controls)
- Whether plan-suggestion and coach-tip dismissals stay local-only or move server-side
- Whether a future LLM layer is used only for copy, or also for ranking which deterministic tips to show
- Monorepo tooling (pnpm/npm workspaces, uv, etc.) — optional; not required to keep shipping
- Import aggregator and billing (when §12 is built): Plaid vs Teller vs SimpleFIN (user-pays token); whether Setaside hosts connections or users bring their own; whether a subscription is required before offering hosted bank sync to anyone beyond the owner/family

If an agent needs a choice among reasonable options for an open item, pick a conventional secure default, document it briefly in code/README, and continue.

---

## 12. Deferred: CSV / bank import (Phase 3+ — do not build yet)

Design intent if/when import is explicitly requested. **Do not implement this section during desktop-depth work.** CSV and bank sync share one pipeline. Mixing manual entry with import is allowed; **silent insert is not.**

### 12.1 Why this exists

Users may log during the month (often rounding to the nearest dollar) and later upload a CSV of the same spend, or connect a bank/card so charges appear as they post. Blind import would double-count actuals, inflate the dashboard, and break savings “paid from” pairing. Bank feeds also emit **pending then posted** rows, a second duplicate class.

Until this ships, tracker search/sort is the way to check whether something was already logged.

### 12.2 Pipeline (CSV and bank sync share it)

```text
Bank / CSV
    → fingerprint + store as an import candidate (staging, not the ledger)
    → match against existing tracker rows
    → suggest a category (merchant rules + note/category history)
    → Inbox: accept / merge / skip
    → only then does it become a real Transaction
```

Dashboard, budget vs actual, and savings balances count **accepted tracker rows only**. Uncategorized imports must not become fake budget lines.

**Staging, not nullable categories.** Tracker `category_id` is required today. Import candidates live in a separate table (or equivalent) until the user accepts them with a real category. Do not add an “Uncategorized” category that pollutes plan vs actual.

Product rule for mixed sources: **once an account is connected, do not also CSV that account.** Manual entry stays for cash, unlinked accounts, and corrections.

### 12.3 Fingerprints (exact re-import)

Every imported row needs a stable identity:

- Bank sync: the provider’s transaction id
- CSV: a unique id column if the bank includes one, otherwise a hash of account + posted date + amount + raw description

Same fingerprint twice → skip. Re-uploading last month’s CSV should be a no-op. Pending → posted should update the same candidate when the provider id (or a pending/posted link) matches, not create a second row.

### 12.4 Fuzzy match (manual entry + import of the same spend)

Fingerprints cannot catch “I typed it, then imported it.” Score candidates against existing rows; do not require an exact amount.

Users often **round manual amounts to the nearest dollar** (e.g. posted `$42.18` logged as `$42`). Exact-amount matching would miss those. Nearest-dollar rounding is at most **$0.50** off; use an amount **window**.

| Signal | Tight (high confidence) | Loose (needs extra confirmation) |
|--------|-------------------------|----------------------------------|
| Amount | within **$1** (covers nearest-dollar rounding) | within **$5** or ~2% (e.g. typed `$40` or `$1000`) |
| Date | ±2–3 days (purchase vs posted) | ±5 days |
| Merchant / note | `Costco` vs `COSTCO WHSE #123` | weaker overlap |

Do **not** auto-merge on amount + date alone. Two real $12 coffees on the same day must remain distinguishable. Loose matches go to a “possible duplicate” pile.

Inbox actions:

| Action | When |
|--------|------|
| **Merge** | Same spend. Keep the user’s category, note, and “paid from” bucket; attach the import identity so it will not import again. **Replace the rounded manual amount with the posted amount** so category totals match the bank. |
| **Keep both** | Two real purchases that happen to look similar |
| **Skip** | Already logged; do not keep the import row |

### 12.5 Categorization

Banks will not know Setaside’s user-defined categories. MCC codes are too coarse. Use a ladder:

1. **Payee / merchant rules** — e.g. `COSTCO` → Groceries. User confirms once; later imports apply automatically.
2. **Learn from note memory / history** — if `STARBUCKS` was Dining eight times, suggest Dining the ninth. Rules can be seeded from that history.
3. **First-time merchants go to the inbox** — never silently guess a new payee into a budget category.
4. **Savings “paid from” is never fully automatic** — the bank does not know a repair should withdraw from a bucket. Suggest it if that merchant was funded that way before; confirm at least the first time.
5. **Splits stay manual** — import the total (e.g. Costco), then the user splits groceries vs household.
6. **Recurring schedules** can pre-fill category for a known payee; the inbox is still “accept this paycheck,” not auto-create without review.

### 12.6 Bank / card connections (later than CSV)

CSV inbox + fingerprints + rules first. Bank/card connect is **another source into the same inbox**, not a separate importer.

Typical US aggregators: **Plaid** (widest coverage; opaque pricing), **Teller** (public Transactions price), **SimpleFIN Bridge** (user-pays token; weaker freshness). MX/Finicity are enterprise-shaped and a poor fit for a small app.

What bank sync is **not**: instant at the register (often hours or next day); free; a replacement for cash/Venmo/unlinked cards; enough without inbox, fingerprints, and rules.

**Billing (plan before offering this to anyone else):**

- Aggregators bill the **app operator** per connected **institution login** (“Item” / enrollment), monthly, while the connection exists — not per purchase and not per Setaside user.
- One Discover login = 1 Item. Five cards at five banks = 5 Items. Several cards under one bank login = still 1 Item.
- Broken connections still bill until disconnected; mid-month connect/disconnect is typically **not prorated**.
- Plaid does not publish a rate card (shown after Production access). **Trial:** 10 Production Items free (US/Canada, new teams as of the 2026 Trial plan). **Pay-as-you-go** industry reports are often ~$0.30–$1.50 per Item / month. **Growth/Custom** add monthly minimums aimed at businesses, not hobby use.
- **Teller (public):** Transactions **$0.30 per enrollment / month**; developer tier includes 100 live connections free.
- **SimpleFIN:** each **user** pays ~$15/year (or $1.50/month) for up to 25 institutions and pastes a token into the app — Setaside’s aggregator COGS can be $0.

Implications:

| Audience | Practical approach |
|----------|-------------------|
| Owner only (e.g. one Discover card) | Plaid Trial or Teller free cap can be $0 |
| Closed family | Teller-like cost is small (5 institutions ≈ $1.50/month per person on Teller’s public Transactions price) |
| Anyone on the internet | Hosted Plaid/Teller is a **paid product** (operator invoice scales with users × institutions). Charge a subscription, cap connections, or use user-pays SimpleFIN. CSV stays free. |

**Do not start hosted bank sync for the public without an explicit billing decision.** CSV remains the zero-COGS import path.

### 12.7 Accounts and transfers (only when multiple accounts can import)

One CSV of one card does not require a full account model. Connecting **checking + a card** does: a card payment is −$500 checking and +$500 on the card — a **transfer**, not an expense. Logging both as spend double-counts.

Sequence when this is built:

1. CSV of one account + inbox + dedup + merchant rules
2. Bank/card sync as another source into that inbox
3. **Accounts + transfers** only when more than one account can import

### 12.8 Lifestyles this should support

| Style | How | Duplicate risk |
|-------|-----|----------------|
| Manual during the month | Current product; best for noticing spend | Low |
| CSV at month end | Catch-up via inbox; merge rounded manual rows | Safe if inbox exists; a mess if not |
| Connected accounts + daily inbox | New charges as they post; short confirm pass | Safe if that account is not also typed/CSV’d |

Mixing manual + CSV is OK because of merge. Do not mix CSV and live sync for the **same** account. End-of-month-only is optional, not required, once the inbox exists.
