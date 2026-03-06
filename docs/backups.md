# Backups e Restore — Revo ERP

Fonte de verdade para toda a estratégia de backup e recuperação do banco de dados.

---

## 1) Estratégia (visão geral)

- **Supabase PITR**: camada primária de DR (snapshots e point-in-time recovery providos pelo Supabase).
- **Cloudflare R2**: cofre barato e durável para `pg_dump` diário (`.dump.gz` + `manifest.json`). Redundância externa ao provedor.
- **Restore drill semanal**: valida automaticamente que o último backup restaura com sucesso (`rg03_db_asserts.sql`).
- **Backup local**: script para gerar arquivo na máquina do administrador (uso emergencial/auditoria offline).

---

## 2) GitHub Actions (automação R2)

### Workflows

| Workflow | Trigger | O que faz |
|---|---|---|
| `db-backup.yml` | Cron diário + manual | `pg_dump` → R2 (`.dump.gz` + `manifest.json`) |
| `db-backup-restore-drill.yml` | Cron semanal | Restaura último dump em Postgres temporário + `rg03_db_asserts.sql` |
| `db-restore-from-r2.yml` | Manual | Restaura dump específico do R2 → `dev/verify` (ou `prod` com confirmação) |
| `tenant-backup.yml` | Cron | Backup por tenant (dados isolados) |
| `tenant-restore-from-r2.yml` | Manual | Restaura tenant específico do R2 |

### Secrets necessários no GitHub (repo)

```
R2_ENDPOINT
R2_BUCKET          (default: revo-erp-backups-prod)
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
SUPABASE_DB_URL_PROD
```

### Estrutura no bucket R2

```
revo/<target>/YYYY/MM/DD/<arquivo>.dump.gz
revo/<target>/YYYY/MM/DD/manifest.json
```

---

## 3) Como rodar backup manualmente

1. GitHub → **Actions** → **DB Backup (Supabase)** → **Run workflow**
2. Parâmetros:
   - `target`: `dev` | `prod` | `verify`
   - `mode`: `full` (schema + dados) | `schema-only` (auditoria rápida)
3. Baixe o artifact gerado (arquivo `.dump.gz`).

---

## 4) Como fazer restore

### 4.1 Restore local (recomendado para inspeção e validação)

```bash
# 1) Crie um banco vazio local
createdb revo_restore

# 2) Descomprima o dump (se .gz)
gunzip backup.dump.gz

# 3) Restaure
pg_restore --no-owner --no-privileges --clean --if-exists -d revo_restore backup.dump
```

### 4.2 Restore via GitHub Actions (para ambientes remotos)

Workflow: `.github/workflows/db-restore-from-r2.yml`

Parâmetros:
- `target`: ambiente de destino (`dev` | `verify`)
- `date`: data do backup desejado (`YYYY/MM/DD`)
- `filename`: nome do arquivo no bucket

> Para restore em `prod`: requer confirmação explícita. Sempre faça backup do estado atual antes.

### 4.3 Restore em Supabase (destrutivo — apenas DR)

Evite restaurar "por cima" em ambientes que você quer preservar.

Quando for inevitável:
1. Confirme que **não há dados importantes no destino** (ou que o restore é parte do plano de DR).
2. Faça backup do estado atual (seção 3).
3. Execute `pg_restore` apontando para `SUPABASE_DB_URL_<TARGET>`.

> Observação: restore em Supabase exige atenção com permissões/owners. O caminho canônico é manter a verdade do schema em `supabase/migrations/*` e usar restore completo apenas em cenários de DR real.

---

## 5) Drill de restore (verificação semanal)

O workflow `db-backup-restore-drill.yml` executa automaticamente:
1. Baixa o dump mais recente do R2
2. Restaura em Postgres temporário (ephemeral)
3. Roda `scripts/rg03_db_asserts.sql` — se falhar, alerta via Actions

**Por que o drill importa**: um backup que não restaura é inútil. O drill garante que o procedimento funciona antes de ser necessário em urgência.

---

## 6) Runbook de DR (disaster recovery)

Ver: `docs/runbooks/drift-dev-prod.md` para procedimentos de alinhamento DEV↔PROD.

Checklist mínimo em caso de DR:
1. Acionar backup imediato do estado atual (mesmo que corrompido — preserve a evidência).
2. Identificar o ponto de restauração correto (PITR Supabase ou dump R2 mais recente íntegro).
3. Restaurar em ambiente `verify` primeiro e validar com `rg03_db_asserts.sql`.
4. Só então promover para `prod` via workflow controlado.
5. Registrar o incidente em `docs/transfer-pack/postmortem.md`.
