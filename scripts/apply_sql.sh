#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' $0 <sql_file1> [sql_file2 ...]" >&2
  exit 2
fi

: "${DATABASE_URL:?DATABASE_URL is required (do not paste it in chat; set it in your terminal env)}"

for file in "$@"; do
  if [[ ! -f "$file" ]]; then
    echo "File not found: $file" >&2
    exit 2
  fi

  echo "Applying $file..."
  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$file"
done
