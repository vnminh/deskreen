#!/usr/bin/env bash
set -e

DESKREEN_PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKREEN_ENTRY="$DESKREEN_PROJECT/out/main/index.js"
DESKREEN_ELECTRON="$DESKREEN_PROJECT/node_modules/.bin/electron"
DESKREEN_SANDBOX="$DESKREEN_PROJECT/node_modules/electron/dist/chrome-sandbox"
ELECTRON_ARGS=()

if [ ! -f "$DESKREEN_ENTRY" ]; then
  echo "Deskreen has not been built. Run: cd $DESKREEN_PROJECT && npm run build" >&2
  exit 1
fi

if [ "$(uname -s)" = "Linux" ]; then
  SANDBOX_OWNER="$(stat -c '%u' "$DESKREEN_SANDBOX" 2>/dev/null || true)"
  SANDBOX_MODE="$(stat -c '%a' "$DESKREEN_SANDBOX" 2>/dev/null || true)"
  if [ "$SANDBOX_OWNER" != "0" ] || [ "$SANDBOX_MODE" != "4755" ]; then
    ELECTRON_ARGS+=(--no-sandbox)
  fi
fi

exec "$DESKREEN_ELECTRON" "${ELECTRON_ARGS[@]}" "$DESKREEN_ENTRY" "$@"
