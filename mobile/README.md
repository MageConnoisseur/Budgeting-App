# Setaside — Android

Standalone phone app for logging expenses. It is a real Android APK: install it, put the phone in your pocket, and it talks to the same live API as the website. Your computer does not need to stay on.

**Fast path:** open Setaside → sign in → amount + category → Log expense.

Planning, categories, budgets, and the dashboard stay on the website. This app does not reimplement them.

## Install on your phone (sideload)

You do **not** need Expo Go or the Play Store. Android can install an APK you built.

### Option A — Android Studio

#### 1. Install Node.js once

This computer needs Node 22. Download LTS from [nodejs.org](https://nodejs.org), or on Ubuntu/Debian:

```bash
sudo apt update
sudo apt install nodejs npm
```

#### 2. Run this in a terminal

```bash
cd mobile
bash ./scripts/setup-android-studio.sh
```

That installs JavaScript packages. It also puts `node` where Android Studio can see it (`/usr/local/bin/node`). The script may ask for your password once. You do **not** edit any properties file by hand.

If sync still says `Cannot run program "node"`, pull the latest fix branch and re-run setup (it patches Expo’s Gradle plugins to find Node without PATH):

```bash
cd /path/to/Budgeting-App
git fetch origin
git checkout -B cursor/android-studio-node-bec9 origin/cursor/android-studio-node-bec9
cd mobile
bash ./scripts/setup-android-studio.sh
```

Then fully quit Android Studio and sync again.

#### 3. Sync and build in Android Studio

1. Fully quit Android Studio if it is open (**File → Exit**).
2. Open **Android Studio**.
3. **File → Open** and choose the `mobile/android` folder (not the repo root).
4. **File → Sync Project with Gradle Files**.
5. **Build → Select Build Variant** and pick **release** (debug still wants a Metro server).
6. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
7. Click **locate** and copy `app-release.apk` to your phone.
8. On the phone, open the file and install it. Allow “Install unknown apps” if Android asks.

### Option B — command line (often easier)

You can skip Android Studio sync and build the APK in a terminal:

```bash
cd mobile
bash ./scripts/setup-android-studio.sh
npm run apk
```

That writes:

`mobile/android/app/build/outputs/apk/release/app-release.apk`

Copy it to the phone, or with USB debugging:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Sign in with the same username/email and password as the website. Create expense categories on the website first.

## API

The APK is built against the live Render API:

`https://budgeting-app-m3aj.onrender.com`

Same origin the website uses. Native Android does not use CORS.

To point a **rebuild** at a different API (for example a local server), set `EXPO_PUBLIC_API_URL` before `npm run apk`. Changing `.env` after the APK is installed does nothing — the URL is baked in at build time.

## Scripts

```bash
npm run studio-setup   # Node check + npm install (run before Android Studio)
npm run apk            # release APK with JS + API URL inside
npm run android        # build release and install on a plugged-in device
npm test
npm run typecheck
```

`npx expo prebuild --platform android` regenerates `android/` from `app.config.ts`. Do not add Budget/Dashboard screens here; keep this client a logger.
