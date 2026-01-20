#!/usr/bin/env bash
set -euo pipefail

EXCLUDES=(
  gotrue
  realtime
  storage-api
  imgproxy
  kong
  mailpit
  postgrest
  postgres-meta
  studio
  edge-runtime
  logflare
  vector
  supavisor
)

SUPABASE_START_CMD=(supabase start --ignore-health-check)
for x in "${EXCLUDES[@]}"; do
  SUPABASE_START_CMD+=(-x "$x")
done

echo "[CI] Starting Supabase (DB-only)…"
echo "[CI] Command: ${SUPABASE_START_CMD[*]}"

run_with_timeout() {
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
    return $?
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
    return $?
  fi
  echo "[CI] WARN: 'timeout' not found; running without timeout (local/dev convenience)."
  "$@"
}

if ! run_with_timeout 1200 "${SUPABASE_START_CMD[@]}"; then
  echo "::error::supabase start timed out or failed."
  supabase status || true
  docker ps || true
  exit 1
fi

LOCAL_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
echo "[CI] Waiting for Postgres on 54322…"
for i in $(seq 1 60); do
  if psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -X -qAt -c 'select 1' >/dev/null 2>&1; then
    echo "[CI] Postgres is ready."
    exit 0
  fi
  echo "[WAIT] postgres not ready ($i/60)"
  sleep 2
done

echo "::error::Postgres not reachable after 120s."
supabase status || true
docker ps || true
exit 1
