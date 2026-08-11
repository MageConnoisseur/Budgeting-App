# Budgeting App

Full-stack budgeting app (web + future mobile) for monthly income, expenses, and savings planning, transaction tracking, and analysis.

**For product vision, architecture, and agent rules, see [`instructions.md`](./instructions.md).** Cursor agents auto-load [`AGENTS.md`](./AGENTS.md), which points them at that file.

## Repo layout

```text
/
  instructions.md
  api/          # FastAPI → Render (Phase 1)
  apps/web/     # React (Vite) → Vercel
  apps/mobile/  # Expo → phase 2
```

## API

See [`api/README.md`](./api/README.md) for setup, auth (JWT), amount conventions, and routes.

## Web

See [`apps/web/README.md`](./apps/web/README.md). Locally: run the API on `:8000`, then `cd apps/web && npm install && npm run dev`.
