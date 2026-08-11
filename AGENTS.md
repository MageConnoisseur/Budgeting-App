# Agent instructions

Before planning or writing code for this repository, **read and follow [`instructions.md`](./instructions.md)** at the repo root.

That file is the source of truth for:

- Product vision (budget planner, transaction tracker, dashboard)
- Budget copy-forward behavior and Monthly/Annual views
- Savings buckets, tracker search/sort, soft over-budget rules
- Stack and hosting (React/Vercel, FastAPI/Render, Postgres/Neon)
- Phase 1 MVP scope vs later mobile/import/auth work
- Coding-agent rules and decision log

Do not invent conflicting product or architecture choices. If something is unclear, prefer the guidance in `instructions.md`.

## Cursor Cloud

Cloud agents should treat `instructions.md` as required project context for every task in this repo. Keep Phase 1 scope unless the user explicitly asks for Phase 2+ work.
