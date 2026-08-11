# Budgeting App

Full-stack budgeting app (web + future mobile) for monthly income, expenses, and savings planning, transaction tracking, and analysis.

**For product vision, architecture, and agent rules, see [`instructions.md`](./instructions.md).** Cursor agents auto-load [`AGENTS.md`](./AGENTS.md), which points them at that file.

## Repo layout

```text
/
  instructions.md
  api/          # FastAPI → Render (Phase 1)
  web/          # React (Vite) → Vercel
  mobile/       # Expo → phase 2 (later)
```

Top-level `web/` (sibling of `api/`) so Vercel’s Root Directory dropdown can select it — nested `apps/web` is often omitted from that picker.

## API

See [`api/README.md`](./api/README.md) for setup, auth (JWT), amount conventions, and routes.

## Web

See [`web/README.md`](./web/README.md). Locally: run the API on `:8000`, then `cd web && npm install && npm run dev`. On Vercel, set **Root Directory** to `web`.
