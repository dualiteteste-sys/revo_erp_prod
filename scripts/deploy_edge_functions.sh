#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "Missing env SUPABASE_PROJECT_REF" >&2
  exit 1
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing env SUPABASE_ACCESS_TOKEN" >&2
  exit 1
fi

functions_dir="supabase/functions"
if [[ ! -d "$functions_dir" ]]; then
  echo "Directory not found: $functions_dir" >&2
  exit 1
fi

no_verify_jwt=(
  "stripe-webhook"
  "billing-webhook"
  "focusnfe-webhook"
  # WooCommerce: endpoints públicos/infra usam auth via keys próprios (não JWT).
  "woocommerce-webhook"
  "woocommerce-worker"
  "woocommerce-scheduler"
)

is_no_verify() {
  local name="$1"
  for n in "${no_verify_jwt[@]}"; do
    if [[ "$n" == "$name" ]]; then
      return 0
    fi
  done
  return 1
}

# Only deploy functions that actually have an entrypoint.
# This prevents empty/legacy folders from being deployed.
mapfile -t functions < <(
  for d in "$functions_dir"/*; do
    [[ -d "$d" ]] || continue
    [[ -f "$d/index.ts" ]] || continue
    basename "$d"
  done | sort
)

if [[ ${#functions[@]} -eq 0 ]]; then
  echo "No Edge Functions found under $functions_dir" >&2
  exit 1
fi

for fn in "${functions[@]}"; do
  if [[ "$fn" == _* ]]; then
    continue
  fi
  echo "[edge] Deploying: $fn"
  max_attempts=4
  attempt=1
  while true; do
    set +e
    if is_no_verify "$fn"; then
      out="$(supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt 2>&1)"
      code=$?
    else
      out="$(supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" 2>&1)"
      code=$?
    fi
    set -e

    if [[ $code -eq 0 ]]; then
      break
    fi

    # Retry on transient auth/rate-limit/network errors seen in Supabase API.
    if echo "$out" | grep -E -q "status 401|Unauthorized|status 429|Too Many Requests|timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|5[0-9]{2}"; then
      if [[ $attempt -lt $max_attempts ]]; then
        sleep_for=$((attempt * 3))
        echo "::warning::Edge deploy falhou para '$fn' (tentativa $attempt/$max_attempts). Retentando em ${sleep_for}s..."
        echo "$out" | tail -n 5 || true
        sleep "$sleep_for"
        attempt=$((attempt + 1))
        continue
      fi
    fi

    echo "::error::Falha ao deployar Edge Function '$fn' (tentativa $attempt/$max_attempts)."
    echo "$out"
    exit $code
  done
done
