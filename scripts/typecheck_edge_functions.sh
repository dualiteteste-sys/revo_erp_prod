#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Lint all Edge Functions before deploy.
# Catches syntax errors, bad patterns, and common mistakes.
#
# Uses `deno lint` (no dep resolution needed) for reliable CI checks.
# `deno check` requires all npm transitive deps cached which is fragile
# in CI; `deno lint` catches the most impactful issues without that.
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

  # Lint: catches syntax errors, bad patterns, unused vars, etc.
  if ! deno lint "$d" --quiet 2>&1; then
    echo "::error::Lint failed for Edge Function '$fn'"
    errors=$((errors + 1))
  fi
done

echo ""
echo "[lint] Checked $checked functions, $errors error(s)."

if [[ $errors -gt 0 ]]; then
  exit 1
fi
