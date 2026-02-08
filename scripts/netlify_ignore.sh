#!/usr/bin/env bash
set -euo pipefail

# Netlify ignore command contract:
# - exit 0 => skip build
# - exit 1 => run build

base_ref="${CACHED_COMMIT_REF:-}"
head_ref="${COMMIT_REF:-HEAD}"

# First build or unknown comparison point: build to be safe.
if [[ -z "$base_ref" ]]; then
  echo "[NETLIFY][IGNORE] CACHED_COMMIT_REF missing; running build."
  exit 1
fi

if ! git cat-file -e "${base_ref}^{commit}" 2>/dev/null; then
  echo "[NETLIFY][IGNORE] Base ref not found locally; running build."
  exit 1
fi

files="$(git diff --name-only "$base_ref" "$head_ref" || true)"
if [[ -z "$files" ]]; then
  echo "[NETLIFY][IGNORE] No file changes detected; skipping build."
  exit 0
fi

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  case "$file" in
    src/*|src/**|public/*|public/**|index.html|vite.config.ts|tailwind.config.js|postcss.config.js|package.json|yarn.lock|.yarnrc.yml|.yarn/*|.yarn/**|netlify.toml)
      echo "[NETLIFY][IGNORE] Frontend/runtime change found ($file); running build."
      exit 1
      ;;
  esac
done <<< "$files"

echo "[NETLIFY][IGNORE] Non-runtime changes only; skipping build."
exit 0
