#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build

PREVIEW_HOST=127.0.0.1
PREVIEW_PORT="${E2E_PORT:-4173}"
PREVIEW_URL="http://${PREVIEW_HOST}:${PREVIEW_PORT}"
PREVIEW_LOG="$(mktemp "${TMPDIR:-/tmp}/math-worksheet-preview.XXXXXX")"
PREVIEW_PID=""

cleanup_preview() {
  if [ -n "$PREVIEW_PID" ]; then
    kill "$PREVIEW_PID" >/dev/null 2>&1 || true
    wait "$PREVIEW_PID" >/dev/null 2>&1 || true
    PREVIEW_PID=""
  fi
  if [ -n "$PREVIEW_LOG" ]; then
    rm -f "$PREVIEW_LOG"
    PREVIEW_LOG=""
  fi
}

trap cleanup_preview EXIT HUP INT TERM
pnpm exec vite preview --host "$PREVIEW_HOST" --port "$PREVIEW_PORT" --strictPort >"$PREVIEW_LOG" 2>&1 &
PREVIEW_PID=$!
if ! curl --retry 20 --retry-delay 1 --retry-all-errors -fsS "$PREVIEW_URL/" >/dev/null ||
  ! kill -0 "$PREVIEW_PID" >/dev/null 2>&1; then
  sed -n '1,160p' "$PREVIEW_LOG" >&2
  exit 1
fi
APP_URL="$PREVIEW_URL" pnpm test:e2e
APP_URL="$PREVIEW_URL" pnpm test:layout
APP_URL="$PREVIEW_URL" pnpm test:sudoku-layout
APP_URL="$PREVIEW_URL" pnpm test:binary-reasoning-layout
cleanup_preview
trap - EXIT HUP INT TERM

docker compose build --pull
docker compose up -d --remove-orphans
docker image prune -f --filter "label=com.docker.compose.project=math-worksheet" >/dev/null 2>&1 || true
docker compose ps
