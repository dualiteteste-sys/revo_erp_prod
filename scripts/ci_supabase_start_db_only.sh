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

MAX_RETRIES=3
for attempt in $(seq 1 "$MAX_RETRIES"); do
  echo "[CI] Attempt $attempt/$MAX_RETRIES …"
  if run_with_timeout 300 "${SUPABASE_START_CMD[@]}"; then
    echo "[CI] supabase start succeeded on attempt $attempt."
    break
  fi
  echo "[CI] supabase start failed on attempt $attempt."
  supabase status || true
  docker ps || true
  supabase stop --no-backup 2>/dev/null || true
  docker rm -f $(docker ps -aq --filter "name=supabase_") 2>/dev/null || true
  if [ "$attempt" -eq "$MAX_RETRIES" ]; then
    echo "::error::supabase start timed out or failed after $MAX_RETRIES attempts."
    exit 1
  fi
  echo "[CI] Retrying in 10s…"
  sleep 10
done

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
