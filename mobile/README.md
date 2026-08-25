# Setaside — Mobile

Thin **Expo** client for logging expenses on the go. It talks to the same FastAPI backend as the website. Planning, categories, budgets, and the dashboard stay on the web app — this phone app does not reimplement them.

**Fast path:** open app → sign in → amount + category → Log expense.

## What it does

- Sign in with the same username/email + password as the website
- Log an **expense** against existing expense categories
- Optional note (with the same note-memory suggestions as web)
- If that category is **paid from** a savings bucket this month, offer the same paired withdrawal
- Recent expenses with search, tap-to-edit, delete
- Sign out

**Not in this app:** registration, OAuth, budget editor, dashboard, category CRUD, income/savings logging. Use the website.

## Setup

```bash
cd mobile
cp .env.example .env   # set EXPO_PUBLIC_API_URL
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android first).

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_URL` | FastAPI origin, no trailing slash, no `/api`. Same value as web `VITE_API_URL`. |

### Connecting to the API

| Where you run Expo | `EXPO_PUBLIC_API_URL` |
|--------------------|------------------------|
| Production / out and about | Your Render origin, e.g. `https://your-service.onrender.com` |
| API on this machine + Android emulator | `http://localhost:8000` (rewritten to `10.0.2.2`) |
| API on this machine + physical phone | `http://YOUR_LAN_IP:8000` (phone and computer on the same Wi-Fi) |
| Expo web in a browser | `http://localhost:8000` — CORS must allow `http://localhost:8081` |

Native Android/iOS do not use CORS. Expo web does.

Create expense categories (and your account) on the website first. The phone app only logs against categories that already exist.

## Scripts

```bash
npm start          # Expo dev server
npm run android    # Expo Go / emulator
npm run web        # Browser preview
npm test           # Unit tests (format + HTTP client)
npm run typecheck  # tsc --noEmit
npm run mock-api   # In-memory API on :8000 for local Expo web checks
```

App Store / Play Store / EAS builds are later. This folder is meant to stay a small logging client so new product work lands on `web/` instead of both clients.
