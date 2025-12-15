#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Uso: scripts/compare_public_schema.sh <DB_URL_A> <DB_URL_B>" >&2
  echo "Dica: passe as URLs via env var para não vazar no histórico do shell:" >&2
  echo "  scripts/compare_public_schema.sh \"$DB_URL_DEV\" \"$DB_URL_PROD\"" >&2
  exit 2
fi

DB_A="$1"
DB_B="$2"

tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT

dump_one() {
  local db_url="$1"
  local out="$2"
  psql "$db_url" -v ON_ERROR_STOP=1 -X -qAt -f scripts/public_schema_snapshot.sql > "$out"
}

normalize() {
  cat "$1"
}

dump_one "$DB_A" "$tmp_dir/a.sql"
dump_one "$DB_B" "$tmp_dir/b.sql"

normalize "$tmp_dir/a.sql" > "$tmp_dir/a.norm.sql"
normalize "$tmp_dir/b.sql" > "$tmp_dir/b.norm.sql"

diff -u "$tmp_dir/a.norm.sql" "$tmp_dir/b.norm.sql"
