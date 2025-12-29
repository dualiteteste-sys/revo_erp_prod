# Backup/Restore (Supabase) — rotina simples

Este documento cobre o “básico bem feito” para não ficarmos reféns de drift, bugs ou reset acidental.

## 1) Backup automático (GitHub Actions)

Workflow: `.github/workflows/db-backup.yml`

Ele faz `pg_dump` e publica um artifact `.dump`.

### Como rodar manualmente

1) GitHub → **Actions** → **DB Backup (Supabase)** → **Run workflow**
2) `target`:
   - `dev`: REVO-DEV
   - `prod`: REVO-PROD
   - `verify`: DR-VERIFY
3) `mode`:
   - `full`: schema + dados
   - `schema-only`: só estrutura (útil para auditoria rápida)
4) Baixe o artifact gerado (arquivo `.dump`).

### Agendamento

O workflow roda diariamente (cron) e, por padrão, faz backup do `prod` quando acionado pelo schedule.

## 2) Restore local (recomendado para inspeção)

Você pode restaurar o `.dump` em um Postgres local para inspecionar/validar:

1) Crie um banco vazio local (ex.: `createdb revo_restore`)
2) Restore:
   - `pg_restore --no-owner --no-privileges --clean --if-exists -d revo_restore <arquivo>.dump`

## 3) Restore em Supabase (destrutivo)

Evite restaurar “por cima” em ambientes que você quer preservar.

Quando for inevitável:

1) Confirme que **não há dados importantes** (ou que o restore é parte do plano).
2) Faça backup do estado atual (seção 1).
3) Restaure apontando para o DB alvo (`SUPABASE_DB_URL_*`) com `pg_restore`.

Observação: restore em Supabase costuma exigir atenção com permissões/owners; por isso o caminho padrão é:
- manter a verdade do schema em `supabase/migrations/*`
- e usar restore completo só em cenários de DR.

