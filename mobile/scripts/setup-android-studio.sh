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
  echo "On Ubuntu/Debian you can also run:"
  echo "  sudo apt update && sudo apt install nodejs npm"
  echo
  echo "Then run this script again."
  exit 1
fi

NODE_PATH="$(command -v node)"
echo "Using ${NODE_PATH} ($(node -v))"
npm install
chmod +x android/bin/node android/gradlew 2>/dev/null || true

# Remember the real Node path for Android Studio (it cannot see nvm's PATH).
# Keep any sdk.dir line Android Studio already wrote.
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

# Expo's Gradle plugins call the command name `node`. Android Studio's daemon
# only searches /usr/bin and /usr/local/bin, not nvm. Link once if needed.
if [[ -x /usr/bin/node || -x /usr/local/bin/node ]]; then
  echo "System Node is already on Android Studio's PATH."
else
  echo "Linking Node into /usr/local/bin so Android Studio can find it (sudo once)..."
  if sudo ln -sf "${NODE_PATH}" /usr/local/bin/node; then
    echo "Linked /usr/local/bin/node -> ${NODE_PATH}"
  else
    echo "Could not create /usr/local/bin/node. Install Node with:"
    echo "  sudo apt update && sudo apt install nodejs npm"
    echo "or start Android Studio from this same terminal after Node works here."
  fi
fi

if [[ -x android/gradlew ]]; then
  (cd android && ./gradlew --stop >/dev/null 2>&1 || true)
fi

echo
echo "Setup finished."
echo "In Android Studio: File → Sync Project with Gradle Files"
echo "If it still fails, quit Android Studio completely and open the folder"
echo "  $(pwd)/android"
echo "again."
