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
- [ ] Validar em `prod` (empresa `leandrofmarques@me.com`) antes de dedupe no Stripe:
  - [ ] Disparar export do tenant em `prod` com label `antes-limpeza-stripe`
  - [ ] Confirmar que apareceu no catálogo `ops_tenant_backups`
  - [ ] Validar restore em `verify` (ou `dev`) e checar dados mínimos
