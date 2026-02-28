#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Type-check all Edge Functions before deploy.
# Catches syntax errors, missing imports, and type mismatches that
# would only surface at runtime in Deno Deploy.
#
# Usage: bash scripts/typecheck_edge_functions.sh
# Requires: deno (installed via denoland/setup-deno in CI)
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

functions_dir="supabase/functions"
if [[ ! -d "$functions_dir" ]]; then
  echo "Directory not found: $functions_dir" >&2
  exit 1
fi

errors=0
checked=0

for d in "$functions_dir"/*/; do
  fn="$(basename "$d")"

  # Skip shared utilities (not deployable functions)
  [[ "$fn" == _* ]] && continue

  # Only check functions with an entrypoint
  [[ -f "$d/index.ts" ]] || continue

  checked=$((checked + 1))
  echo "[typecheck] Checking: $fn"

  if ! deno check "$d/index.ts" 2>&1; then
    echo "::error::Type check failed for Edge Function '$fn'"
    errors=$((errors + 1))
  fi
done

echo ""
echo "[typecheck] Checked $checked functions, $errors error(s)."

if [[ $errors -gt 0 ]]; then
  exit 1
fi
