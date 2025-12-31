# Go-Live (GL-02 / GL-03) — Operação “sem susto”

Este documento é um guia prático (e curto) para:
- **GL-02**: backup/restore + rotinas de suporte (exportações e trilha de auditoria)
- **GL-03**: hardening final (segurança, permissões, RLS, rate limits e erros amigáveis)

## GL-02 — Backup / Restore / Suporte

### 1) Backup (GitHub Actions)

Workflow: `DB Backup (Supabase)` em `.github/workflows/db-backup.yml`.

- **Manual**: `Actions → DB Backup (Supabase) → Run workflow`
  - `target`: `prod` (ou `dev`/`verify`)
  - `mode`: `full` ou `schema-only`
  - O backup sai como **artifact** `.dump`
- **Agendado**: já roda diariamente (cron do workflow).

### 2) Restore (procedimento manual, destrutivo)

Use quando:
- você aceitou destruir registros do ambiente, ou
- você quer recriar um ambiente de teste exatamente como um backup.

Passos (local, com `pg_restore`):

1. Baixe o artifact `.dump` do workflow.
2. Tenha a `DATABASE_URL` do alvo (DEV/PROD/VERIFY).
3. Rode:
   - Restaurar schema + data:
     - `pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" supabase_<target>_<ts>.dump`
   - Se quiser **somente schema**:
     - use `mode=schema-only` no backup (preferível) e restaure normalmente.
4. Recarregue PostgREST:
   - `psql "$DATABASE_URL" -c "notify pgrst, 'reload schema';"`

Observação: o projeto já tem pipelines destrutivos controlados (ex.: reset), então **restore** é uma operação “último caso”.

### 3) Exportações para suporte (operação)

Padrão do produto:
- Listas principais têm exportação CSV (`UX-03`).
- Auditoria básica existe em `Developer → Logs` (UI), alimentado por `public.app_logs`/`audit.events`.

Checklist suporte (quando o cliente reportar problema):
- Abrir `Developer → Logs` e filtrar por período/evento.
- Exportar CSV da lista do módulo afetado (para reproduzir).
- Rodar “Compare expected vs PROD schema” se suspeitar de drift.

## GL-03 — Hardening final

O que consideramos “hardening mínimo” no Revo:

### 1) Portas de entrada do banco
- **PROD só recebe mudanças via `main`** (migrations + pipeline).
- RPCs críticas devem ser `security definer` + `require_permission_for_current_user`.

### 2) Multi-tenant (empresa)
- Tabelas multi-tenant devem ter `empresa_id` e RLS por `empresa_id`.
- Preferir `force row level security` para impedir bypass acidental.

### 3) Permissões e UX de erro
- O app deve:
  - bloquear o que não pode (menu/rota) **e**
  - falhar de forma clara no RPC/DB (permissão).
- Erros não tratados devem ser capturados/logados com contexto.

### 4) Workers / Jobs
- Toda fila:
  - idempotência por chave/estado
  - retry com backoff
  - dead-letter (ou status “dead”)
  - observabilidade (logs)

No Revo:
- NFE.io worker já existe.
- Automações de vendas usam fila e worker via Actions.

