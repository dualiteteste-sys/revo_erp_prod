# Backups (Banco de Dados) — Revo ERP

Este documento descreve o backup de **registros (dados)** do Postgres/Supabase de forma barata e resiliente.

## Estratégia (baixo custo)

- **Supabase**: continua como DR (PITR/snapshots do provedor).
- **Cloudflare R2**: cofre barato/durável para `pg_dump` diário (`.dump.gz` + `manifest.json`).
- **Restore drill semanal**: valida que o último backup restaura (evita “backup que não restaura”).
- **Backup local**: script para gerar arquivo no computador do cliente/admin.

## GitHub Actions (R2)

Workflows:
- `.github/workflows/db-backup.yml`: gera dump diário e envia para R2 (secrets obrigatórios).
- `.github/workflows/db-backup-restore-drill.yml`: restaura o último dump em Postgres temporário e roda `scripts/rg03_db_asserts.sql`.

Secrets necessários no GitHub (repo):
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Estrutura no bucket:
- `revo/<target>/YYYY/MM/DD/<arquivo>`

## Backup local (máquina do cliente/admin)

Requisitos:
- Docker instalado
- `DATABASE_URL` apontando para o banco

Rodar:
```bash
DATABASE_URL="postgresql://..." ./scripts/backup_db_local.sh prod
```

Saída:
- `backups/supabase_<target>_<UTC_TIMESTAMP>.dump.gz`
- `backups/supabase_<target>_<UTC_TIMESTAMP>.manifest.json`

