# CHECKLIST — Stripe / Assinaturas + Backup por Tenant (Revo ERP)

Objetivo: eliminar **403 intermitente** causado por inconsistências de assinatura/tenant e garantir **idempotência**, **sync automático** e **backup/restore por empresa** antes de operações sensíveis (ex.: dedupe no Stripe).

## P0 — Diagnóstico (antes de mexer em fluxo)
- [ ] Capturar 1 sessão real com 403 (Scale/Owner) e registrar:
  - [ ] RPC/rota que falhou (Ops → Diagnóstico: 403)
  - [ ] `request_id`, `empresa_id`, `role`, `plano_mvp`, `kind` (missing_active_empresa / plan_gating / permission)
  - [ ] Print/JSON do evento (Copiar amostra + Copiar contexto)
- [ ] Confirmar se o 403 vem de:
  - [ ] RLS / permissão (42501)
  - [ ] enforcement de plano/entitlements
  - [ ] “assinatura não sincronizada” (dados ainda não chegaram no Supabase)

## P1 — Prevenir duplicidade e “Empresa sem nome” (checkout)
- [x] Modal inicial de assinatura pedir **CNPJ primeiro**
  - [x] Ao blur/tab, buscar Razão Social/Nome fantasia e preencher automaticamente
  - [x] Validar CNPJ (14 dígitos)
- [x] Persistir empresa antes do checkout:
  - [x] `cnpj`
  - [x] `razao_social`/`nome_razao_social`
  - [x] `fantasia`/`nome_fantasia`
- [x] Edge Function `billing-checkout`:
  - [x] Criar/atualizar Customer com `name` correto
  - [x] Setar `metadata: { empresa_id, cnpj }`
  - [x] Reusar customer via `metadata['empresa_id']` e fallback via `metadata['cnpj']`

## P2 — Sync automático (anti “precisa clicar sincronizar”)
- [x] Boot: ao entrar no app (empresa ativa), se não houver subscription local:
  - [x] rodar `billing-sync-subscription` automaticamente (best-effort)
  - [x] atualizar UI/entitlements sem exigir ação manual do usuário
- [x] Idempotência: limitar tentativas automáticas (ex.: 1 por sessão / janela de tempo)
- [x] Pós-checkout: na rota `/app/billing/success`, rodar `billing-sync-subscription` (best-effort) e disparar refresh de features

## P3 — Higienização e dedupe (ops/admin)
- [ ] Ferramenta interna (ops) para encontrar duplicados no Stripe:
  - [ ] por `metadata.cnpj` e/ou email
  - [ ] por múltiplos customers ligados à mesma empresa
- [x] Tool (estado da arte): `/app/desenvolvedor/stripe-dedupe` para inspecionar customers e vincular o `stripe_customer_id` correto no tenant (não destrutivo)
- [ ] Procedimento de dedupe seguro (checklist operacional):
  - [ ] gerar backup do tenant (prod) **antes**
  - [ ] remover/mesclar customer duplicado no Stripe
  - [ ] re-sync e validar acesso (sem 403)

## P4 — Backup por tenant (empresa) — antes do go-live
- [x] Implementar `Dev → Backup por Empresa` (empresa ativa)
- [x] Configurar no **Supabase PROD** (Edge Functions → Secrets) as variáveis usadas pelo dispatcher:
  - [x] `GITHUB_TOKEN` (ou `GITHUB_PAT`) com permissão **Actions: Read and write** no repo que contém os workflows (`dualiteteste-sys/revo_erp_prod`)
  - [x] (Opcional) `GITHUB_REPO` (default: `dualiteteste-sys/revo_erp_prod`)
  - [x] (Opcional) `GITHUB_DEFAULT_REF` (default: `main`)
- [ ] Validar em `prod` (empresa `leandrofmarques@me.com`) antes de dedupe no Stripe:
  - [x] Disparar export do tenant em `prod` com label `antes-limpeza-stripe`
  - [ ] Confirmar que apareceu no catálogo `Dev → Backup por Empresa` (tabela `ops_tenant_backups`)
  - [ ] Rodar **restore drill** em `verify` (sem tocar em prod):
    - [ ] Ação rápida: `Dev → Backup por Empresa` → `Restore drill (verify)` (usa o último backup catalogado de `prod`)
    - [ ] Alternativa: clicar em um backup `prod` e restaurar em `verify`
  - [ ] Check mínimo pós-restore (verify):
    - [ ] Login funciona (owner)
    - [ ] Empresa ativa abre sem 403
    - [ ] Assinatura sincroniza automaticamente (sem clicar em “Sincronizar”)

## P5 — Backup/Restore por tenant (global, estado da arte)
Objetivo: garantir que **cada tenant** consiga ter backup/restore seguro, com custo controlado e sem risco de vazamento entre empresas.
- [ ] Segurança & auditoria:
  - [x] Backup/restore só para `ops:manage` e sempre amarrado ao `current_empresa_id()`
  - [x] Logar evento interno (quem disparou, quando, target, r2_key, run_url) via `public.log_app_event` (Developer → Logs)
- [ ] Resiliência:
  - [x] Restore sempre para `verify` como drill padrão (sem tocar em prod)
  - [x] Bloquear restore em `prod` sem confirmação explícita (`RESTORE_PROD_TENANT`)
  - [x] Rodar assert mínimo pós-restore automaticamente quando target=`verify` (script `scripts/tenant_restore_verify_asserts.sql`)
- [ ] Retenção/custos:
  - [x] Definir retenção automática no R2 via GitHub Actions (`.github/workflows/r2-retention.yml`)
    - Detalhes atuais: purge diário (06:10 UTC), `PREFIX=revo/`, `DAYS=90` (ajustável via PR/parametrização futura).
  - [ ] Documentar política: quando gerar backup por tenant (ex.: antes de dedupe/limpeza, antes de migrações grandes, antes de ações destrutivas)

- [x] Restore drill recorrente (amostra) em `verify` (`.github/workflows/tenant-restore-drill-verify.yml`)
