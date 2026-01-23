# CHECKLIST — Estado da Arte 9/10 (Revo ERP)

Objetivo: elevar o ERP para **nota mínima 9/10** nos quesitos técnicos e de produto, com foco em **multi-tenant**, **segurança**, **confiabilidade** e **qualidade de UI**.

Como usar:
- Marque itens concluídos com `- [x]` e pendentes com `- [ ]`.
- Execute **na ordem** (P0 → P1 → …). Evite pular blocos.
- Regra de ouro: **qualquer alteração no Supabase vira migration** (`supabase/migrations/*`).

Definições:
- **Console limpo**: sem erros no Console e sem Network com `4xx/5xx` em fluxos esperados.
- **Checks verdes**: CI (lint/test/e2e/verify migrations) verde em `dev` e, quando autorizado, em `prod`.
- **Fonte da verdade**: o backend (Postgres/RLS/RPC) é a autoridade; o frontend nunca “simula” segurança.

---

## P-1 — Governança de entrega (processo) (meta 9/10)

- [x] Definir “Definition of Done” (DoD) e seguir estritamente (checks verdes + console limpo + migrations).
- [x] Trabalhar em blocos “5 em 5” (fatia vertical) com push em `dev` ao final de cada bloco.
- [x] Atualizar checklist ao final de cada bloco (status `[x]/[ ]`).
- [x] `prod` somente por comando explícito do owner.

---

## P0 — Fundamentos do Multi-tenant (Segurança + estabilidade do contexto)

### 0.1 Empresa ativa / contexto (boot determinístico)
- [x] Unificar “source of truth” do contexto (userId, empresa ativa, role, plano) em um único ponto.
  - [x] Criar `AppContextProvider` consolidando `Auth + Subscription + Role` e expor `useAppContext()` (frontend).
  - [x] Migrar guards de permissão (`RequirePermission`) para usar o contexto unificado (reduz race/duplicação).
- [x] Garantir que nenhum módulo faça fetch de dados antes de `activeEmpresaId` estar resolvido (gates consistentes).
- [x] Tornar “empresa ativa” RPC-first (evitar `.from('empresas'|'user_active_empresa')` no boot):
  - [x] RPC `active_empresa_get_for_current_user()` (tenant-safe via `auth.uid()`).
  - [x] RPC `empresas_list_for_current_user(p_limit)` (tenant-safe via `empresa_usuarios.user_id = auth.uid()`).
- [x] Padronizar recovery automático (apenas quando seguro) e mensagens UX (“Selecione sua empresa”).
- [x] Evitar tenant “sem plano”: ao concluir `/auth/callback`, criar trial no banco via RPC (`billing_start_trial_for_current_user`) quando veio da seleção de plano.
- [x] Cobrir boot com E2E: login → empresa ativa → navegação por 5 módulos sem 403.
- [x] Cobrir landing pública sem sessão/empresa ativa (E2E `e2e/landing-public.spec.ts`).

### 0.2 RBAC e áreas internas (Ops/Dev)
- [x] Garantir que `ops/*` e ferramentas internas exijam permissão explícita (sem bypass por admin/owner).
- [x] Padronizar verificação de permissão: UI (guards) + backend (RPC) coerentes.
- [x] Garantir que o sistema não dispare chamadas “ops” em telas de usuário final.
  - [x] Dashboard: trocar `ops_app_logs_list` por RPC tenant-safe `dashboard_activity_feed`.
  - [x] Remover links diretos para `/app/desenvolvedor/*` do ErrorBoundary e expor apenas para `ops:view`.

**Aceite P0**
- [ ] 0 ocorrências de 403 intermitente em `dev` por 72h (fluxos core).
- [x] `yarn test:e2e:gate:all` verde com console-sweep limpo.
- [x] Monitoramento contínuo em DEV: workflow `OPS health alert (DEV)` (a cada 15 min) abre issue quando `kind=missing_active_empresa` > 0.
- [x] Evidência automatizada do SLO 72h: workflows `OPS SLO — 72h sem 403 (DEV/PROD)` geram artifact/summary e abrem issue em caso de violação.

---

## P1 — Segurança / AppSec (RLS + RPC) (meta 9/10)

### 1.1 RLS: isolamento por empresa (inventário e correções)
- [x] Rodar inventário RLS (UI/RPC) e exportar snapshot (dev e prod).
- [x] Automatizar snapshot RLS via GitHub Actions (`.github/workflows/ops-rls-snapshot.yml`).
- [x] Evidência snapshot RLS (DEV): Run `21106091992` (label `audit-20260118-013608-dev`) + artifacts `rls_snapshot_dev.json`/`.id` (baixado em `artifacts/rls-snapshot-21106091992/rls-snapshot-dev`).
- [x] Evidência snapshot RLS (PROD): Run `21106091992` (label `audit-20260118-013608-prod`) + artifacts `rls_snapshot_prod.json`/`.id` (baixado em `artifacts/rls-snapshot-21106091992/rls-snapshot-prod`).
- [x] Link (evidência): `https://github.com/dualiteteste-sys/revo_erp_prod/actions/runs/21106091992`
- [x] Ajustar heurística do inventário para considerar membership (`empresa_usuarios` + `auth.uid()`) como tenant-safe (reduz “MÉDIO” falso-positivo).
- [x] Refinar classificação “MÉDIO”: não sinalizar como “MÉDIO” tabelas sem grants para `authenticated` (service_role-only/internal), para reduzir ruído operacional.
- [x] Corrigir RLS crítico: tabelas que permitem leitura ampla indevida (ex.: policies `using(true)`).
  - [x] Corrigir `public.empresas`: remover `using(true)` e restringir SELECT por membership/owner (migration).
- [x] Remover/evitar “grants sem RLS” em tabelas `public` (gated por asserts RG01).
  - [x] (Exceção tratada) `public.wrappers_fdw_stats` (extensão): revogar grants de `authenticated/anon/public` (migration `20270118121500_revoke_wrappers_fdw_stats_grants.sql`).
- [x] Corrigir itens “MÉDIO” do inventário (policies multi-tenant com `current_empresa_id()`), via migrations.
  - [x] `unidades_medida`, `embalagens`, `industria_ct_aps_config`, `industria_ct_calendario_semana`, `pcp_aps_runs`, `pcp_aps_run_changes` (migration `20270118130000_sec_rls_current_empresa_cadastros_ops.sql`).
- [x] Garantir que o inventário não tenha itens “MÉDIO” (grants + empresa_id + RLS ON, mas sem policy `current_empresa_id()`).
  - [x] Gate em `scripts/rg03_db_asserts.sql` (SEC-01b/RG-03).
- [x] Garantir que tabelas multi-tenant tenham:
  - [x] `empresa_id` obrigatório e consistente (guardrails via migration `20270118193000_mt_empresa_id_guardrails.sql`), com exceções explícitas para catálogos globais (`unidades_medida`, `embalagens`).
  - [x] policies `USING/WITH CHECK` baseadas em `current_empresa_id()` (ou heurística equivalente tenant-safe), com gate RG03 (`scripts/rg03_db_asserts.sql`) garantindo 0 “MÉDIO”.
  - [x] índices mínimos para filtros por `empresa_id` (migration `20270119174500_mt_empresa_id_min_indexes.sql`)

### 1.2 Acesso a dados: RPC-first para áreas sensíveis
- [x] Definir regra: “acesso direto a tabela” permitido **somente** quando RLS for simples e auditado (`docs/supabase-from-policy.md` + gate `scripts/check_supabase_from_allowlist.mjs`).
- [x] Migrar acesso direto do client para RPC em domínios críticos (billing, financeiro, indústria, LGPD) — inventários sem ocorrências (`INVENTARIO-SUPABASE-FROM.md` / `INVENTARIO-POSTGREST-FROM.md`).
- [x] Inventário `supabase.from()` atualizado (regex cobre quebras de linha) e exportado em `INVENTARIO-SUPABASE-FROM.md`.
- [x] Gate `supabase.from()` (client-side) ativo com allowlist vazio (`scripts/check_supabase_from_allowlist.mjs` OK; `INVENTARIO-SUPABASE-FROM.md` sem ocorrências).
- [x] RPC-first (Inventário `supabase.from()`): remover ocorrências em `src/**` (migration `20270120123000_sec_rpc_first_inventory_supabase_from.sql`).
- [x] Inventário PostgREST `.from('tabela')` exportado em `INVENTARIO-POSTGREST-FROM.md` (script `scripts/inventory_postgrest_from.mjs`).
- [x] Gate PostgREST `.from('tabela')` ativo (allowlist `scripts/postgrest_from_allowlist.json` + `scripts/check_postgrest_from_allowlist.mjs`).
- [x] RPC-first (Serviços MVP): migrar `src/services/servicosMvp.ts` para RPC (`servicos_contratos_*`, `servicos_notas_*`, `servicos_cobrancas_*`) e remover do allowlist (migration `20270121130000_sec_rpc_first_servicos_vendas_mvp.sql`).
- [x] RPC-first (Serviços Contratos): migrar `src/services/servicosContratosBilling.ts`, `src/services/servicosContratosItens.ts`, `src/services/servicosContratosTemplatesAdmin.ts` para RPC-first e remover do allowlist.
- [x] RPC-first (Vendas MVP): migrar `src/services/vendasMvp.ts` para RPC-first e remover do allowlist (inclui devolução transacional/idempotente via migration `20270121150000_vendas_devolucao_idempotent_rpc.sql`).
- [x] RPC-first (Billing): substituir `supabase.from('plans'/'subscriptions'/'billing_stripe_webhook_events')` por RPCs (`billing_plans_public_list`, `billing_subscription_with_plan_get`, `billing_stripe_webhook_events_list`).
- [x] RPC-first (Financeiro piloto): revogar grants em tabelas `financeiro_%/finance_%/finops_%` e manter acesso via RPCs (migration `20270118133000_fin_ops_health_rpc_and_revoke_fin_grants.sql`).
  - [x] Ops/Health: substituir `supabase.from()` por RPCs SECURITY DEFINER (mesma migration) e verificar via asserts (script `scripts/verify_financeiro_rpc_first.sql`).
- [x] RPC-first (Financeiro piloto): incluir `contas_a_receber` no gate de grants e revogar grants diretos (migration `20270119180000_fin_rpc_first_contas_a_receber_revoke_grants.sql` + update `scripts/verify_financeiro_rpc_first.sql`).
- [x] RPC-first (Empresa Features): substituir `supabase.from('empresa_features')` por `rpc/empresa_features_get` e revogar grants de tabela (migration `20270118124000_empresa_features_rpc_first.sql`).
- [x] RPC-first (Fiscal/NF-e settings): remover escrita direta do client e exigir admin no backend (RPCs `fiscal_feature_flags_set`, `fiscal_nfe_emissao_config_*`, `fiscal_nfe_emitente_*`, `fiscal_nfe_numeracao_*`).
- [x] RPC-first (Fiscal/NF-e emissões): remover leitura/escrita direta no client e exigir RPCs tenant-safe (RPCs `fiscal_nfe_emissoes_list`, `fiscal_nfe_emissao_itens_list`, `fiscal_nfe_audit_timeline_list`, `fiscal_nfe_emissao_draft_upsert`).
- [x] RPC-first (Onboarding/Roadmap): remover acesso direto do client a `empresa_onboarding` e persistir via RPC (`onboarding_wizard_state_get`, `onboarding_wizard_state_upsert`).
- [x] RPC-first (Financeiro): substituir `supabase.from('financeiro_conciliacao_regras')` por RPCs SECURITY DEFINER com RBAC (tesouraria).
- [x] RPC-first (Conciliação Bancária): sugerir/buscar/conciliar extratos com títulos (pagar/receber) via RPCs (`financeiro_conciliacao_titulos_sugerir`, `financeiro_conciliacao_titulos_search`, `financeiro_conciliacao_conciliar_extrato_com_titulo`).
- [x] RPC-first (RBAC): substituir `supabase.from('roles/permissions/role_permissions')` por RPCs SECURITY DEFINER com `roles:manage` e update atômico.
- [x] RPC-first (Billing/Entitlements): substituir acessos diretos a `empresa_entitlements` por RPCs tenant-safe + revogar grants diretos (migration `supabase/migrations/20270120193000_sec_rpc_first_audit_entitlements.sql`).
- [x] RPC-first (Audit Trail UI): substituir `.from('audit_logs')` por RPC `audit_logs_list_for_tables` + revogar grants diretos da tabela (migration `supabase/migrations/20270120193000_sec_rpc_first_audit_entitlements.sql`).
- [x] Padronizar respostas de erro (códigos + mensagens PT-BR) e traduzir para UX palatável (`src/lib/toastErrorNormalizer.ts`).

### 1.3 Segurança de funções e grants
- [ ] Revisar RPCs `SECURITY DEFINER`: sempre filtrar por `current_empresa_id()` e validar permissões.
  - [x] Financeiro: gate de hardening em `scripts/verify_financeiro_rpc_first.sql` (tenant + permission guard + search_path) + fixes em `supabase/migrations/20270118202000_fin_hardening_security_definer_financeiro.sql`.
- [ ] Padronizar grants: `anon`/`authenticated` mínimos; `service_role` apenas onde necessário.
- [ ] Padronizar “ops/service” tables: somente service_role escreve; leitura controlada.

### 1.2 RPC-first: Suprimentos (Recebimentos)
- [x] Migrar Recebimentos para RPC-first (sem `supabase.from('recebimentos'|'recebimento_itens')` no app) e revogar grants diretos (migration `supabase/migrations/20270119191000_sup_recebimentos_rpc_first.sql`).
- [x] Atualizar inventário `INVENTARIO-SUPABASE-FROM.md` e reduzir superfície de tabelas diretas em domínios sensíveis.

### 1.3 RPC-first: Comissões (Vendedores) (piloto)
- [x] Migrar Vendedores para RPC-first (sem PostgREST direto em `public.vendedores` no app) e revogar grants diretos (migration `supabase/migrations/20270120201000_sec_rpc_first_vendedores.sql`).
- [x] Atualizar inventário `INVENTARIO-POSTGREST-FROM.md` e remover `src/services/vendedores.ts` do allowlist.

### 1.4 RPC-first: Vendas (PDV/Comissões/Relatórios) — read models
- [x] Remover `.from('vendas_pedidos')` do frontend (PDV/Comissões/Relatórios) e expor RPCs dedicadas (migration `supabase/migrations/20270121100000_sec_rpc_first_vendas_pedidos_error_reports.sql`).
- [x] Revogar grants diretos em `public.vendas_pedidos` (mesma migration) e manter acesso apenas via RPC/`service_role`.

### 1.5 RPC-first: Ops — Error Reports
- [x] Remover `.from('error_reports')` do frontend e migrar para RPC (`ops_error_reports_list`, `ops_error_reports_set_status`) (migration `supabase/migrations/20270121100000_sec_rpc_first_vendas_pedidos_error_reports.sql`).
- [x] Revogar grants diretos em `public.error_reports` (mesma migration) e manter acesso apenas via RPC/`service_role`.

**Aceite P1**
- [ ] Auditoria manual: tentar acessar dados de outra empresa (negado sempre).
- [ ] “Tabela direta” no client: inventariada e aprovada (com justificativa) — reduzir `scripts/postgrest_from_allowlist.json` por domínio até zerar em áreas sensíveis.

---

## P2 — Confiabilidade / Resiliência (meta 9/10)

### 2.1 Idempotência e consistência transacional
- [ ] Idempotência em operações críticas (financeiro/vendas/estoque): `idempotency_key`/unique constraints/`ON CONFLICT`.
- [ ] Evitar “meio gravado”: usar transações no Postgres (RPC) para gravações multi-tabela.
- [ ] Double-submit: botões com lock + dedupe no backend.

### 2.2 Falhas de rede e timeouts
- [ ] Retentativas padronizadas apenas para transitórios (408/429/5xx/failed-to-fetch).
  - [x] Implementar helper `src/lib/retry.ts` e aplicar em `src/hooks/useEmpresaFeatures.ts`.
- [ ] UX offline: estados “reconectando”, “tentar novamente”, sem perder formulário.
- [ ] “Console limpo”: falhas esperadas nunca viram stacktrace vermelho.

**Aceite P2**
- [x] E2E de regressão para flows críticos (compra/recebimento/xml/PDV/pedido/financeiro/indústria) via `yarn test:e2e:gate:all` (suites definidas em `docs/e2e-release-gates.md`).
- [ ] Zero duplicidade causada por double-submit.

---

## P3 — Performance / Eficiência (meta 9/10)

### 3.1 Padrões de listagem
- [ ] Padronizar paginação/ordenção/filtros em todas as listas grandes.
- [ ] Remover `select('*')` onde não é necessário (buscar colunas mínimas).
- [ ] Evitar N+1: consolidar agregações no backend (RPC) e usar joins/CTEs com índices.

### 3.2 Frontend perf
- [ ] Auditar re-renders em telas críticas (dashboards e grids grandes).
- [ ] React Query: `staleTime/keepPreviousData` e keys sempre incluindo `empresaId`.

**Aceite P3**
- [ ] Dashboard e listas críticas com tempo consistente (SLO definido) em dados “reais”.

---

## P4 — Manutenibilidade / Padrões (meta 9/10)

### 4.1 Estrutura em camadas e redução de complexidade
- [ ] Padronizar camadas (`pages → components → hooks → services → lib`).
- [ ] Reduzir “arquivos gigantes” (extrair subcomponentes, serviços e modelos).
- [ ] Remover duplicações (utilitários comuns, normalizers e contracts por domínio).

### 4.2 TypeScript (zero-any em áreas críticas)
- [x] Criar “budget” de `any` por domínio e bloquear novos `any` em auth/billing/financeiro/indústria.
- [ ] Tipar inputs/outputs dos RPCs (DTOs) e centralizar em `src/contracts/` (ou equivalente).
- [ ] Normalizar retornos do Supabase (nullables, enums, data shapes) com testes.

**Aceite P4**
- [ ] Redução mensurável do `any` em áreas críticas e PRs menores e mais legíveis.

---

## P5 — Observabilidade (meta 9/10)

### 5.1 Padrão único de logs e request_id
- [ ] Padronizar `request_id` (propagar client → logs → RPC → Edge).
- [ ] Taxonomia de eventos (auth/rpc/financeiro/estoque/indústria/billing).
- [ ] Painel interno: erros por severidade, por módulo, por empresa, por usuário.

### 5.2 “Erros no Sistema” (beta)
- [x] Capturar erros reais (uncaught/5xx/network.rpc) com contexto (rota/última ação/request_id).
- [x] Workflow triagem (status: novo → investigando → corrigido/ignorado) e SLA beta (migration `20270118140000_ops_app_errors_triage_status.sql`).

---

## P6 — Testabilidade / Qualidade (meta 9/10)

### 6.1 Gates e regressão
- [x] `release:check` verde (unit + e2e + verify migrations) como pré-requisito de merge (branch protection em `main` exigindo `Verify Migrations (Clean Slate)` + `Release Gate (Unit + E2E)`).
- [x] Expandir console-sweep para rotas principais e erros esperados “não vermelhos” (inclui Financeiro + landing pública).
- [x] Testes DB asserts (verify) para RLS e invariantes críticos.
  - [x] RG01 DB asserts: bloquear tabela `public` com grants p/ `authenticated` sem RLS; bloquear policy `qual/with_check=true` em tabelas com `empresa_id` para `authenticated/public/anon`.
  - [x] RG03 DB asserts: falhar verify se houver tabela com `empresa_id` + grants p/ `authenticated` com RLS ON mas sem policy tenant-safe.

### 6.2 Mocks e isolamento
- [ ] Services desacoplados de UI (facilitar mocks).
- [ ] Contratos por domínio com testes unitários (normalizers/validators).

---

## P7 — UX / UI (meta 9/10)

### 7.1 Fluxos sem fricção
- [ ] Reduzir cliques redundantes (imports, wizards, finalizações).
- [ ] Feedback consistente (loading/sucesso/erro) e mensagens palatáveis PT-BR.

### 7.2 Consistência visual e responsividade
- [ ] Matriz de breakpoints (mobile/tablet/desktop) para telas críticas.
- [ ] Modais/pickers/tabelas: padrões únicos e testes visuais (quando possível).

---

## P8 — Compliance / Privacidade (LGPD) (meta 9/10)

- [ ] Revisar PII em logs (sanitizar email/cnpj/ids sensíveis quando necessário).
- [ ] Exportação/remoção de dados com trilha de auditoria (quando aplicável).
- [ ] Política de retenção (logs/eventos/backups) documentada.

---

## P9 — FinOps / Custos (meta 9/10)

- [ ] Identificar top RPCs/queries por custo (tempo/volume) e otimizar (índices/aggregations/cache).
- [ ] Retenção/arquivamento de logs e snapshots para controlar custo.
- [ ] Budgets (bundle/perf) + alertas.

---

## P10 — Backups / DR (meta 9/10)

- [ ] Backup por tenant + restore drill periódico em ambiente `verify` (sem tocar em prod).
- [ ] Catálogo auditável (quem/quando/r2_key) e checks mínimos pós-restore automatizados.
- [ ] Procedimento operacional (runbook) para incidentes (falha de billing, rollback, restore).

---

## “Done” (9/10)

- [ ] 0 vazamentos cross-tenant em auditoria.
- [ ] 0 403 intermitentes em fluxos core por 7 dias (monitorado).
- [ ] `release:check` verde de forma consistente.
- [ ] Runbooks: migrations, billing/stripe, backups/restore, incident response.

---

## Referências

- Roadmap: `ROADMAP-CAMINHO-DO-SUCESSO.md`
- Checklist anterior (histórico): `CHECKLIST-ESTADO-DA-ARTE.md`
- Checklist Stripe/Backups (histórico): `CHECKLIST-STRIPE-ASSINATURAS.md`
