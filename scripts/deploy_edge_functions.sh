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
  if is_no_verify "$fn"; then
    supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
  else
    supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF"
  fi
done
