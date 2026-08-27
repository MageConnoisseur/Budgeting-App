# Setaside — Android

Standalone phone app for logging expenses. It is a real Android APK: install it, put the phone in your pocket, and it talks to the same live API as the website. Your computer does not need to stay on.

**Fast path:** open Setaside → sign in → amount + category → Log expense.

Planning, categories, budgets, and the dashboard stay on the website. This app does not reimplement them.

## Install on your phone (sideload)

You do **not** need Expo Go or the Play Store. Android can install an APK you built.

### Option A — Android Studio

This project needs **Node.js 22** on the machine that runs Android Studio (Gradle calls `node` during sync). Install it from [nodejs.org](https://nodejs.org) or:

```bash
sudo apt update
sudo apt install nodejs npm
```

Then:

```bash
cd mobile
npm install
```

1. Open **Android Studio**.
2. **File → Open** and choose `mobile/android` (the `android` folder, not the repo root).
3. Wait for Gradle to sync.
4. **Build → Build Bundle(s) / APK(s) → Build APK(s)** (use the **release** variant so the JavaScript is packed inside the app).
5. When it finishes, click **locate** and copy `app-release.apk` to your phone.
6. On the phone, open the file and install it. Allow “Install unknown apps” for Files / Chrome if Android asks.

If sync fails with `Cannot run program "node"`: Android Studio was started without Node on its PATH (common with nvm). In a terminal run `which node`, then create `mobile/android/local.properties` (next to `settings.gradle`) with your SDK path **and**:

```properties
sdk.dir=/home/YOU/Android/Sdk
node.binary=/full/path/from/which/node
```

Then **File → Sync Project with Gradle Files**.

### Option B — command line

```bash
cd mobile
npm install
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
npm run apk        # release APK with JS + API URL inside
npm run android    # build release and install on a plugged-in device
npm test
npm run typecheck
```

`npx expo prebuild --platform android` regenerates `android/` from `app.config.ts`. Do not add Budget/Dashboard screens here; keep this client a logger.
