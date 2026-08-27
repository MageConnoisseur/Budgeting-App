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
# Prefer the real binary, not a shell function / relative path.
NODE_PATH="$(readlink -f "${NODE_PATH}" 2>/dev/null || printf '%s' "${NODE_PATH}")"
echo "Using ${NODE_PATH} ($(node -v))"
npm install
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

# Expo's Gradle plugins hardcode commandLine("node"). Android Studio's daemon
# does NOT see nvm. It only finds Node if it lives in a normal PATH location.
studio_node=""
for candidate in /usr/local/bin/node /usr/bin/node; do
  if [[ -x "${candidate}" ]]; then
    studio_node="${candidate}"
    break
  fi
done

if [[ -z "${studio_node}" ]]; then
  echo
  echo "Android Studio cannot see Node yet (only nvm/fnm/volta paths exist)."
  echo "Creating /usr/local/bin/node (needs your password once)..."
  if sudo ln -sf "${NODE_PATH}" /usr/local/bin/node; then
    studio_node=/usr/local/bin/node
    echo "Linked /usr/local/bin/node -> ${NODE_PATH}"
  else
    echo
    echo "Link failed. Run ONE of these, then re-run this script:"
    echo "  sudo ln -sf ${NODE_PATH} /usr/local/bin/node"
    echo "  sudo apt update && sudo apt install nodejs npm"
    exit 1
  fi
fi

echo "Android Studio Node path: ${studio_node} ($(${studio_node} -v))"

if [[ -x android/gradlew ]]; then
  (cd android && ./gradlew --stop >/dev/null 2>&1 || true)
fi

echo
echo "Setup finished."
echo
echo "Next:"
echo "  1. Fully quit Android Studio (File → Exit)."
echo "  2. Open Android Studio again."
echo "  3. File → Open → $(pwd)/android"
echo "  4. File → Sync Project with Gradle Files"
echo
echo "Or skip Studio and build the APK from this terminal:"
echo "  npm run apk"
