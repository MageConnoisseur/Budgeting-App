# Agent instructions

Before planning or writing code for this repository, **read and follow [`instructions.md`](./instructions.md)** at the repo root.

That file is the source of truth for:

- Product vision (budget planner, transaction tracker, dashboard)
- Budget copy-forward behavior and Monthly/Annual views
- Savings buckets, tracker search/sort, soft over-budget rules
- Stack and hosting (React/Vercel, FastAPI/Render, Postgres/Neon)
- **Current focus: robust desktop web (Phase 1.x / v2)** — Phase 1 MVP is done; `mobile/` is a thin expense logger (do not grow it unless asked); growth features are deferred
- Deferred CSV/bank import design (`instructions.md` §12) — inbox, rounding-aware dedup, merchant rules, aggregator cost; do not build unless asked
- Coding-agent rules and decision log
- **Clarify unclear design first** — 1–5 questions (prefer multiple choice) before writing code

Do not invent conflicting product or architecture choices. If something is unclear, prefer the guidance in `instructions.md`. If the design is still unclear after that, **ask before writing code** (see below).

## Clarify design before writing code

If anything about the task is unclear — especially product, UX, layout, copy, or behavior — **ask 1–5 design questions before writing code**. Do not guess a design and implement it.

- Ask **1–5 questions**, not a long questionnaire.
- Prefer **multiple choice**: 2–4 concrete options the user can pick from. When you have a recommendation, mark it (e.g. “Recommended”).
- Use an **open-ended** question only when listing options would hide the real decision (naming, novel copy, a flow that cannot be listed).
- Wait for answers before implementing. If the request is already specific enough, skip this and code.

## Cursor Cloud

Cloud agents should treat `instructions.md` as required project context for every task in this repo. Prefer **desktop web depth** work. Keep `mobile/` a thin expense logger; do not add Budget/Dashboard/Categories there, or Phase 3+ growth features, unless the user explicitly asks.
