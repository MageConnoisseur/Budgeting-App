#!/usr/bin/env bash
# Build a sideloadable release APK with the JS bundle and production API baked in.
# Output: android/app/build/outputs/apk/release/app-release.apk
set -euo pipefail
cd "$(dirname "$0")/.."

export NODE_ENV=production
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://budgeting-app-m3aj.onrender.com}"

if [[ ! -d android ]]; then
  echo "Generating android/ (one-time Expo prebuild)…"
  npx expo prebuild --platform android --non-interactive
fi

cd android
chmod +x gradlew bin/node
./gradlew assembleRelease
APK="app/build/outputs/apk/release/app-release.apk"
echo
echo "APK ready: $(cd .. && pwd)/android/${APK}"
echo "Install: adb install -r ${APK}"
echo "Or copy that file to your phone and open it (allow unknown sources)."
