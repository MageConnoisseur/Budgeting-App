# Budget Desk — Web

Vite + React SPA for the Phase 1 budgeting MVP. Talks to the FastAPI backend via JWT Bearer auth.

## Setup

```bash
cd web
cp .env.example .env   # set VITE_API_URL to your API (default http://localhost:8000)
npm install
npm run dev
```

Dev server: http://localhost:5173

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | FastAPI origin (no trailing slash). CORS on the API must allow this origin. |

## Features wired to the API

- **Auth** — register / login, JWT in `localStorage`, preferences for Monthly/Annual views
- **Categories** — create, list, archive/restore (income / expense / savings)
- **Budget** — monthly editor with copy-forward seed, copy/template actions; editable annual grid
- **Tracker** — cascaded kind → category logging; search, sort, filters, pagination
- **Dashboard** — monthly/annual insights, soft over-budget warnings, rearrangeable widgets

## Deploy (Vercel)

- Root directory: `web` (sibling of `api/` — pick this in the Root Directory dropdown)
- Framework: Vite
- Build: `npm run build`
- Output: `dist`
- Install: `npm install`
- Set `VITE_API_URL` to the Render API URL
- Ensure Render `CORS_ORIGINS` includes the Vercel domain
