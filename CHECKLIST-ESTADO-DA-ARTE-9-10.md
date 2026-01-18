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
- [ ] Unificar “source of truth” do contexto (userId, empresa ativa, role, plano) em um único ponto.
- [ ] Garantir que nenhum módulo faça fetch de dados antes de `activeEmpresaId` estar resolvido (gates consistentes).
- [ ] Padronizar recovery automático (apenas quando seguro) e mensagens UX (“Selecione sua empresa”).
- [x] Cobrir boot com E2E: login → empresa ativa → navegação por 5 módulos sem 403.

### 0.2 RBAC e áreas internas (Ops/Dev)
- [ ] Garantir que `ops/*` e ferramentas internas exijam permissão explícita (sem bypass por admin/owner).
- [ ] Padronizar verificação de permissão: UI (guards) + backend (RPC) coerentes.
- [ ] Garantir que o sistema não dispare chamadas “ops” em telas de usuário final.

**Aceite P0**
- [ ] 0 ocorrências de 403 intermitente em `dev` por 72h (fluxos core).
- [ ] `yarn test:e2e:gate:all` verde com console-sweep limpo.

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
- [ ] Corrigir RLS crítico: tabelas que permitem leitura ampla indevida (ex.: policies `using(true)`).
  - [x] Corrigir `public.empresas`: remover `using(true)` e restringir SELECT por membership/owner (migration).
- [x] Remover/evitar “grants sem RLS” em tabelas `public` (gated por asserts RG01).
  - [ ] (Exceção a tratar) `public.wrappers_fdw_stats` (extensão) pode vir com grants amplos e não é tenant-data.
- [ ] Garantir que tabelas multi-tenant tenham:
  - [ ] `empresa_id` obrigatório e consistente
  - [ ] policies `USING/WITH CHECK` baseadas em `current_empresa_id()`
  - [ ] índices mínimos para filtros por `empresa_id`

### 1.2 Acesso a dados: RPC-first para áreas sensíveis
- [ ] Definir regra: “acesso direto a tabela” permitido **somente** quando RLS for simples e auditado.
- [ ] Migrar acesso direto do client para RPC em domínios críticos (billing, financeiro, indústria, LGPD).
- [x] Inventário `supabase.from()` atualizado (regex cobre quebras de linha) e exportado em `INVENTARIO-SUPABASE-FROM.md`.
- [x] RPC-first (Billing): substituir `supabase.from('plans'/'subscriptions'/'billing_stripe_webhook_events')` por RPCs (`billing_plans_public_list`, `billing_subscription_with_plan_get`, `billing_stripe_webhook_events_list`).
- [x] RPC-first (Fiscal/NF-e settings): remover escrita direta do client e exigir admin no backend (RPCs `fiscal_feature_flags_set`, `fiscal_nfe_emissao_config_*`, `fiscal_nfe_emitente_*`, `fiscal_nfe_numeracao_*`).
- [x] RPC-first (Financeiro): substituir `supabase.from('financeiro_conciliacao_regras')` por RPCs SECURITY DEFINER com RBAC (tesouraria).
- [x] RPC-first (RBAC): substituir `supabase.from('roles/permissions/role_permissions')` por RPCs SECURITY DEFINER com `roles:manage` e update atômico.
- [x] Padronizar respostas de erro (códigos + mensagens PT-BR) e traduzir para UX palatável (`src/lib/toastErrorNormalizer.ts`).

### 1.3 Segurança de funções e grants
- [ ] Revisar RPCs `SECURITY DEFINER`: sempre filtrar por `current_empresa_id()` e validar permissões.
- [ ] Padronizar grants: `anon`/`authenticated` mínimos; `service_role` apenas onde necessário.
- [ ] Padronizar “ops/service” tables: somente service_role escreve; leitura controlada.

**Aceite P1**
- [ ] Auditoria manual: tentar acessar dados de outra empresa (negado sempre).
- [ ] “Tabela direta” no client: inventariada e aprovada (com justificativa).

---

## P2 — Confiabilidade / Resiliência (meta 9/10)

### 2.1 Idempotência e consistência transacional
- [ ] Idempotência em operações críticas (financeiro/vendas/estoque): `idempotency_key`/unique constraints/`ON CONFLICT`.
- [ ] Evitar “meio gravado”: usar transações no Postgres (RPC) para gravações multi-tabela.
- [ ] Double-submit: botões com lock + dedupe no backend.

### 2.2 Falhas de rede e timeouts
- [ ] Retentativas padronizadas apenas para transitórios (408/429/5xx/failed-to-fetch).
- [ ] UX offline: estados “reconectando”, “tentar novamente”, sem perder formulário.
- [ ] “Console limpo”: falhas esperadas nunca viram stacktrace vermelho.

**Aceite P2**
- [ ] E2E de regressão para flows críticos (compra/recebimento/xml/PDV/pedido/financeiro/indústria).
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
- [ ] Criar “budget” de `any` por domínio e bloquear novos `any` em auth/billing/financeiro/indústria.
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
- [ ] Capturar erros reais (uncaught/5xx/network.rpc) com contexto (rota/última ação/request_id).
- [ ] Workflow triagem (status: novo → investigando → corrigido) e SLA beta.

---

## P6 — Testabilidade / Qualidade (meta 9/10)

### 6.1 Gates e regressão
- [ ] `release:check` verde (unit + e2e + verify migrations) como pré-requisito de merge.
- [ ] Expandir console-sweep para rotas principais e erros esperados “não vermelhos”.
- [ ] Testes DB asserts (verify) para RLS e invariantes críticos.
  - [x] RG01 DB asserts: bloquear tabela `public` com grants p/ `authenticated` sem RLS; bloquear policy `qual/with_check=true` em tabelas com `empresa_id` para `authenticated/public/anon`.

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
