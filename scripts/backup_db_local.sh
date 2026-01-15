#!/usr/bin/env bash
set -euo pipefail

# Backup local (máquina do cliente/admin) — Supabase/Postgres
#
# Exemplo:
#   DATABASE_URL="postgresql://..." ./scripts/backup_db_local.sh prod
#
# Saída:
#   ./backups/supabase_<target>_<UTC_TIMESTAMP>.dump.gz
#   ./backups/supabase_<target>_<UTC_TIMESTAMP>.manifest.json
#
# Requisitos:
#   - docker instalado (usa postgres:17 para pg_dump/pg_restore compatível)
#   - variável DATABASE_URL apontando para o banco que será dumpado

target="${1:-prod}"
mode="${MODE:-full}" # full | schema-only

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERRO: defina DATABASE_URL (ex.: postgresql://user:pass@host:5432/db)" >&2
  exit 1
fi

mkdir -p backups
ts="$(date -u +'%Y%m%d_%H%M%S')"
base="supabase_${target}_${ts}"
dump="backups/${base}.dump"
gz="${dump}.gz"

args=(--format=custom --no-owner --no-privileges)
if [[ "$mode" == "schema-only" ]]; then
  args+=(--schema-only)
fi

echo "Gerando dump local: $dump (mode=$mode)"
docker run --rm \
  -v "$PWD:/work" \
  -w /work \
  postgres:17 \
  pg_dump "${args[@]}" "$DATABASE_URL" -f "$dump"

echo "Compactando..."
gzip -9 "$dump"

sha="$(shasum -a 256 "$gz" | awk '{print $1}')"
size="$(stat -f '%z' "$gz" 2>/dev/null || stat -c '%s' "$gz")"

cat > "backups/${base}.manifest.json" <<EOF
{
  "kind": "supabase_db_backup_local",
  "target": "${target}",
  "mode": "${mode}",
  "created_at_utc": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "file": "$(basename "$gz")",
  "sha256": "${sha}",
  "bytes": ${size}
}
EOF

echo "OK:"
ls -lh "$gz" "backups/${base}.manifest.json"

