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
- [ ] Modal inicial de assinatura pedir **CNPJ primeiro**
  - [ ] Ao blur/tab, buscar Razão Social/Nome fantasia e preencher automaticamente
  - [ ] Validar CNPJ (14 dígitos)
- [ ] Persistir empresa antes do checkout:
  - [ ] `cnpj`
  - [ ] `razao_social`/`nome_razao_social`
  - [ ] `fantasia`/`nome_fantasia`
- [ ] Edge Function `billing-checkout`:
  - [ ] Criar/atualizar Customer com `name` correto
  - [ ] Setar `metadata: { empresa_id, cnpj }`
  - [ ] Reusar customer via `metadata['empresa_id']` e fallback via `metadata['cnpj']`

## P2 — Sync automático (anti “precisa clicar sincronizar”)
- [ ] Boot: ao entrar no app (empresa ativa), se não houver subscription local:
  - [ ] rodar `billing-sync-subscription` automaticamente (best-effort)
  - [ ] atualizar UI/entitlements sem exigir ação manual do usuário
- [ ] Idempotência: limitar tentativas automáticas (ex.: 1 por sessão / janela de tempo)

## P3 — Higienização e dedupe (ops/admin)
- [ ] Ferramenta interna (ops) para encontrar duplicados no Stripe:
  - [ ] por `metadata.cnpj` e/ou email
  - [ ] por múltiplos customers ligados à mesma empresa
- [ ] Procedimento de dedupe seguro (checklist operacional):
  - [ ] gerar backup do tenant (prod) **antes**
  - [ ] remover/mesclar customer duplicado no Stripe
  - [ ] re-sync e validar acesso (sem 403)

## P4 — Backup por tenant (empresa) — antes do go-live
- [ ] `Dev → Backup por Empresa` (empresa ativa)
  - [ ] Disparar export do tenant em `prod` com label `antes-limpeza-stripe`
  - [ ] Confirmar que apareceu no catálogo `ops_tenant_backups`
  - [ ] Validar restore em `verify` (ou `dev`) e checar dados mínimos

