# Setaside — Android

Standalone phone app for logging expenses. It is a real Android APK: install it, put the phone in your pocket, and it talks to the same live API as the website. Your computer does not need to stay on.

**Fast path:** open Setaside → sign in → amount + category → Log expense.

Planning, categories, budgets, and the dashboard stay on the website. This app does not reimplement them.

## Install on your phone (sideload)

You do **not** need Expo Go, the Play Store, or a working Android Studio sync.

### Option A — Download from GitHub (easiest)

1. Open the latest release:  
   [https://github.com/MageConnoisseur/Budgeting-App/releases/tag/setaside-android-latest](https://github.com/MageConnoisseur/Budgeting-App/releases/tag/setaside-android-latest)
2. Download **Setaside.apk**
3. Copy it to your phone (USB, Drive, email to yourself, etc.)
4. On the phone, open the file and install. Allow “Install unknown apps” if Android asks.
5. Sign in with the same username/email and password as the website.

If that release is not published yet, download the CI artifact from a green **Android APK** run under the repo’s [Actions](https://github.com/MageConnoisseur/Budgeting-App/actions/workflows/android-apk.yml) tab → open the run → **Artifacts** → **Setaside-android-apk**.

### Option B — Use the APK you already built

If `npm run apk` already succeeded on your computer, the file is here:

`mobile/android/app/build/outputs/apk/release/app-release.apk`

Copy that file to the phone and open it to install. No Android Studio needed.

```bash
# optional USB install if adb works
cd mobile
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

### Option C — Build again from the terminal

```bash
cd mobile
bash ./scripts/setup-android-studio.sh
npm run apk
```

Then copy `android/app/build/outputs/apk/release/app-release.apk` to the phone.

### Option D — Android Studio

Only needed if you want to develop in Studio. The project needs Node 22. Run `bash ./scripts/setup-android-studio.sh` in `mobile/`, open `mobile/android`, sync, and build the **release** variant.

## API

The APK is built against the live Render API:

`https://budgeting-app-m3aj.onrender.com`

Same origin the website uses. Native Android does not use CORS.

To point a **rebuild** at a different API (for example a local server), set `EXPO_PUBLIC_API_URL` before `npm run apk`. Changing `.env` after the APK is installed does nothing — the URL is baked in at build time.

## Scripts

```bash
npm run studio-setup   # Node check + npm install + Expo Node patches
npm run apk            # release APK with JS + API URL inside
npm run android        # build release and install on a plugged-in device
npm test
npm run typecheck
```

`npx expo prebuild --platform android` regenerates `android/` from `app.config.ts`. Do not add Budget/Dashboard screens here; keep this client a logger.
