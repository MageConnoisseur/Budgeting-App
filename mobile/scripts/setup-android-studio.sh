#!/usr/bin/env bash
# One-time setup so Android Studio can sync this Expo Android project.
set -euo pipefail
cd "$(dirname "$0")/.."

load_node_if_needed() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi
  if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
    set +u
    # shellcheck disable=SC1091
    . "${HOME}/.nvm/nvm.sh"
    set -u
  fi
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env 2>/dev/null)" || true
  fi
  if [[ -s "${HOME}/.volta/bin/node" ]]; then
    export PATH="${HOME}/.volta/bin:${PATH}"
  fi
}

load_node_if_needed

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed on this computer."
  echo
  echo "Install Node 22 from https://nodejs.org"
  echo "On Ubuntu/Debian / Pop!_OS:"
  echo "  sudo apt update && sudo apt install nodejs npm"
  echo
  echo "Then run this script again."
  exit 1
fi

NODE_PATH="$(command -v node)"
NODE_PATH="$(readlink -f "${NODE_PATH}" 2>/dev/null || printf '%s' "${NODE_PATH}")"
echo "Using ${NODE_PATH} ($(node -v))"
npm install
node ./scripts/patch-expo-node.js
chmod +x android/bin/node android/gradlew 2>/dev/null || true

PROPS="android/local.properties"
mkdir -p android
if [[ -f "${PROPS}" ]] && grep -qE '^[[:space:]]*node\.binary=' "${PROPS}"; then
  tmp="$(mktemp)"
  sed "s|^[[:space:]]*node\\.binary=.*|node.binary=${NODE_PATH}|" "${PROPS}" > "${tmp}"
  mv "${tmp}" "${PROPS}"
else
  printf '\nnode.binary=%s\n' "${NODE_PATH}" >> "${PROPS}"
fi
echo "Wrote node.binary=${NODE_PATH} into android/local.properties"

# Android Studio GUI PATH usually includes /usr/local/bin but not nvm.
# Create a symlink so any remaining Expo scripts that call bare "node" work.
if [[ ! -x /usr/local/bin/node && ! -x /usr/bin/node ]]; then
  echo
  echo "Linking Node into /usr/local/bin for Android Studio (needs your password once)..."
  sudo ln -sf "${NODE_PATH}" /usr/local/bin/node
fi
if [[ -x /usr/local/bin/node ]]; then
  echo "Studio Node: /usr/local/bin/node -> $(readlink -f /usr/local/bin/node) ($(/usr/local/bin/node -v))"
elif [[ -x /usr/bin/node ]]; then
  echo "Studio Node: /usr/bin/node ($(/usr/bin/node -v))"
else
  echo "WARNING: /usr/local/bin/node is still missing. Android Studio may keep failing."
  echo "Run: sudo ln -sf ${NODE_PATH} /usr/local/bin/node"
fi

rm -rf android/.gradle android/build android/app/build 2>/dev/null || true
find node_modules/expo-modules-autolinking/android/expo-gradle-plugin -type d -name build -prune -exec rm -rf {} + 2>/dev/null || true
if [[ -x android/gradlew ]]; then
  (cd android && ./gradlew --stop >/dev/null 2>&1 || true)
fi

echo
echo "Setup finished."
echo
echo "Preferred: build the APK from this terminal (skips Android Studio sync):"
echo "  npm run apk"
echo
echo "Or in Android Studio:"
echo "  1. Fully quit (File → Exit)"
echo "  2. Open $(pwd)/android"
echo "  3. File → Sync Project with Gradle Files"
echo "  4. Build the release APK"
