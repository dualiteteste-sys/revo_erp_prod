#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Smoke test for PROD after deploy.
# Verifies:
#   1. Frontend is reachable (HTTP 200)
#   2. Supabase health endpoint responds
#   3. PostgREST is alive (anon key + RPC call)
#
# Usage: bash scripts/smoke_test_prod.sh
# Requires env vars: VITE_SITE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

errors=0

check() {
  local label="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local extra_headers="${4:-}"

  echo -n "[smoke] $label ... "

  local cmd="curl -s -o /dev/null -w '%{http_code}' --max-time 15"
  if [[ -n "$extra_headers" ]]; then
    cmd="$cmd -H '$extra_headers'"
  fi
  cmd="$cmd '$url'"

  local status
  status=$(eval "$cmd" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected_status" ]]; then
    echo "OK ($status)"
  else
    echo "FAIL (got $status, expected $expected_status)"
    errors=$((errors + 1))
  fi
}

# 1. Frontend reachable
if [[ -z "${VITE_SITE_URL:-}" ]]; then
  echo "[smoke] VITE_SITE_URL not set, skipping frontend check"
else
  check "Frontend (HTML)" "$VITE_SITE_URL"
fi

# 2. Supabase health
if [[ -z "${VITE_SUPABASE_URL:-}" ]]; then
  echo "[smoke] VITE_SUPABASE_URL not set, skipping Supabase checks"
else
  check "Supabase health" "${VITE_SUPABASE_URL}/rest/v1/" "200" "apikey: ${VITE_SUPABASE_ANON_KEY:-missing}"
fi

# 3. PostgREST RPC reachable (call a lightweight read-only function)
if [[ -n "${VITE_SUPABASE_URL:-}" && -n "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
  # Try calling a known lightweight RPC that doesn't require auth
  # We just check that PostgREST returns a non-5xx response (401/403 is fine = PostgREST alive)
  echo -n "[smoke] PostgREST RPC alive ... "
  rpc_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -X POST \
    "${VITE_SUPABASE_URL}/rest/v1/rpc/active_empresa_get_for_current_user" \
    -d '{}' 2>/dev/null || echo "000")

  # 401 = auth required (expected, PostgREST is alive)
  # 200 = somehow worked (also fine)
  # 5xx or 000 = problem
  if [[ "$rpc_status" =~ ^[2-4] ]]; then
    echo "OK ($rpc_status — PostgREST responding)"
  else
    echo "FAIL ($rpc_status — PostgREST may be down)"
    errors=$((errors + 1))
  fi
fi

echo ""
echo "[smoke] Done. Errors: $errors"

if [[ $errors -gt 0 ]]; then
  exit 1
fi
