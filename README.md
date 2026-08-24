# Setaside

Full-stack personal budgeting app (desktop web first) for monthly income, expenses, and savings planning, transaction tracking, and analysis. A thin Expo client in `mobile/` logs expenses on the go against the same API.

**For product vision, architecture, and agent rules, see [`instructions.md`](./instructions.md).** Cursor agents auto-load [`AGENTS.md`](./AGENTS.md), which points them at that file.

## Repo layout

```text
/
  instructions.md
  api/          # FastAPI → Render (Phase 1)
  web/          # React (Vite) → Vercel
  mobile/       # Expo expense logger (thin; Android / Expo Go)
```

Top-level `web/` (sibling of `api/`) so Vercel’s Root Directory dropdown can select it — nested `apps/web` is often omitted from that picker.

## API

See [`api/README.md`](./api/README.md) for setup, auth (JWT), amount conventions, and routes.

## Web

See [`web/README.md`](./web/README.md). Locally: run the API on `:8000`, then `cd web && npm install && npm run dev`. On Vercel, set **Root Directory** to `web`.

## Mobile

See [`mobile/README.md`](./mobile/README.md). Same API as web. Expense logging only — create categories and plans on the website.
