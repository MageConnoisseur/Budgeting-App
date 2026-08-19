# Agent instructions

Before planning or writing code for this repository, **read and follow [`instructions.md`](./instructions.md)** at the repo root.

That file is the source of truth for:

- Product vision (budget planner, transaction tracker, dashboard)
- Budget copy-forward behavior and Monthly/Annual views
- Savings buckets, tracker search/sort, soft over-budget rules
- Stack and hosting (React/Vercel, FastAPI/Render, Postgres/Neon)
- **Current focus: robust desktop web (Phase 1.x / v2)** — Phase 1 MVP is done; mobile and growth features are deferred
- Deferred CSV/bank import design (`instructions.md` §12) — inbox, rounding-aware dedup, merchant rules, aggregator cost; do not build unless asked
- Coding-agent rules and decision log

Do not invent conflicting product or architecture choices. If something is unclear, prefer the guidance in `instructions.md`.

## Cursor Cloud

Cloud agents should treat `instructions.md` as required project context for every task in this repo. Prefer **desktop web depth** work. Do not start mobile (Phase 2) or Phase 3+ growth features unless the user explicitly asks.
