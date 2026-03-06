# REVO ERP — Constituição do Repositório (AGENTS)

Este arquivo é a **porta de entrada** do projeto para:
- novas janelas de contexto (IA),
- novos devs,
- múltiplos agentes trabalhando **sem regressão**.

Regra: **não duplicar documentação**. Aqui existe o “índice + invariantes + Definition of Done + gatilhos”.

## 0) Prioridade máxima (não negociar)

1) **Zero vazamento multi-tenant** (nenhum dado de uma empresa pode aparecer para outra, nunca).
2) **Tudo que mexe em Supabase vira migration** (`supabase/migrations/*`) — sem drift.
3) **CI verde é requisito para concluir** (DEV primeiro, depois MAIN/PROD quando autorizado).
4) **Nenhum segredo no repo** (somente nomes/uso; valores ficam em Secrets/Env vars).

## 1) Invariantes (Estado da Arte)

### 1.1 Multi-tenant (anti-leak)

- Todo dado tenant-specific deve estar isolado por `empresa_id` e protegido por RLS.
- Toda resolução de tenant deve ser **request-scoped** (sem estado persistente em pool).
- O tenant ativo deve ser definido **antes de qualquer query** via PostgREST (`pgrst.db_pre_request`).
- A fonte de verdade do tenant por requisição é o **header `x-empresa-id`** (quando presente) **validado por membership**.

Documento canônico: `docs/multi-tenant/tenant-resolution.md`.

### 1.2 RPC-first (anti-bypass)

- Domínios sensíveis devem usar **RPC-first** (não acessar tabelas via `supabase.from()` por padrão).
- `supabase.from()` só é permitido quando estiver explicitamente allowlisted e justificado.

Documento canônico: `docs/supabase-from-policy.md`.

### 1.3 Migrations (sem drift)

- Qualquer alteração em tabelas, views, enums, functions/RPCs, triggers, grants e RLS:
  - **apenas por migration** em `supabase/migrations/*`.
- **Data fixes (UPDATE/INSERT) também são migrations** — não há exceção para “só um UPDATE rápido”.
- Mudança feita no dashboard deve ser “convertida” para migration **no mesmo dia**.
- Fluxo obrigatório, mesmo em P1/SEV0:
  1. Escrever migration idempotente em `supabase/migrations/`
  2. PR → CI verde → merge em dev
  3. Só então: se urgente, rodar o SQL da própria migration manualmente em prod
  - **Nunca** inverter essa ordem (rodar em prod antes da migration existir).

Documento canônico: `docs/deploy.md` + `docs/supabase-prod-alignment.md`.

## 2) Definition of Done (DoD)

Um item só pode ser marcado como concluído quando:
- ✅ CI em `dev` está verde (release gate + verify migrations + e2e gates quando aplicável)
- ✅ “Console limpo” no fluxo alterado (sem erros vermelhos)
- ✅ “Network limpo” (sem 4xx/5xx inesperados no fluxo alterado)
- ✅ Mudanças de Supabase estão em migrations e validadas pelo gate
- ✅ (Se multi-tenant / RLS) validação anti-leak executada (ver seção 4)

Gates: `docs/release-gate.md` + `.github/pull_request_template.md`.

## 3) Fluxo de branches e regras de merge

- Branch de trabalho: `dev`
- Produção: `main`
- **Nunca deletar a branch `dev`**.
- **Nunca** mergear em `main` se `dev` estiver vermelho ou divergente por migrations.
- **Nunca** mergear em `main` sem autorização de um humano.
Runbook de drift DEV/PROD: `docs/supabase-prod-alignment.md`.

## 4) Provas mínimas (anti-regressão)

### 4.1 Comandos (local / CI)

- Release gate local (quando necessário): `yarn release:check`
- Migrations verify: `yarn verify:migrations`
- E2E gate (quando aplicável): `yarn test:e2e:gate:all`

### 4.2 Anti-tenant-leak (mínimo)

Veja o checklist completo em `docs/multi-tenant/tenant-resolution.md`.

Resumo do mínimo aceitável:
- Trocar empresa ativa e navegar módulos críticos sem ver dados “estranhos”.
- Abrir duas abas com empresas diferentes e validar que cada uma vê apenas seus dados.
- Validar que `pgrst.db_pre_request` está ativo e que o tenant é transaction-local.

## 5) Gatilhos (Context Packs)

Use esta seção para não “perder o fio” em novas janelas e para orientar outros agentes.

> **Regra de economia de contexto:** ler apenas os docs ativados pelo gatilho do trabalho atual.
> Para tarefas grandes, ler `docs/context/<domínio>.md` antes de qualquer arquivo de código.

### 5.0 Sempre leia ao iniciar qualquer sessão de código

- `docs/context/code-patterns.md` — camadas, tipos, nomes, React Query, tratamento de erros

### 5.1 Mexeu em Supabase / migrations / RLS / RPC

Leia nesta ordem:
1) `docs/supabase-from-policy.md`
2) `docs/multi-tenant/tenant-resolution.md`
3) `docs/supabase-prod-alignment.md`
4) `docs/deploy.md`
5) `docs/release-gate.md`

### 5.1.1 Mexeu em operações críticas (financeiro, estoque, fiscal, vendas)

Leia também:
- `docs/context/resilience-patterns.md` — idempotência, double-submit, retry, timeout

### 5.2 Mexeu em Billing / Stripe / Assinaturas

Leia:
- `docs/billing.md`
- `docs/billing-step1.md`
- `CHECKLIST-STRIPE-ASSINATURAS.md`

### 5.3 Mexeu em Auth / Convites / E-mails

Leia:
- `docs/checklist-estado-da-arte-gaps.md` (seção convites/usuários)
- `docs/runbook-auth-emails.md`

### 5.4 Mexeu em Frontend / UX / componentes globais

Leia:
- `MANUAL-CONTEXTO-CODEX.md` (padrões de UI/UX e decisões de produto)
- `docs/context/code-patterns.md` (padrões React, hooks, componentes)

### 5.4.1 Mexeu em campos de valores (moeda/preço)

Leia:
- `docs/frontend/inputs-monetarios.md` (padrão “digita sem vírgula” via `useNumericField`)

### 5.5 Mexeu em E2E / gates / workflows CI

Leia:
- `docs/context/ci-pipeline.md` — visão geral dos pipelines, tempos, gates
- `docs/e2e-release-gates.md`
- `docs/e2e_checklist.md`
- `docs/release-gate.md`

### 5.6 Mexeu em NF-e XML / recebimento / suprimentos

Leia:
- `docs/context/nfe-input-flow.md` — fluxo 5-step, RPCs, bugs históricos, armadilhas

### 5.7 Mexeu em integrações externas (Stripe, WooCommerce, Focus NF-e, marketplaces)

Leia:
- `docs/context/integrations-testing.md` — como testar em dev sem afetar prod
- `docs/policies/POLITICA_DE_APIS_EXTERNAS.md`

### 5.8 Mexeu em LGPD / PII / Exportação/Retention

Leia:
- `docs/lgpd-01-inventario-dados-pessoais.md`
- `docs/lgpd-02-procedimento-titular.md`

### 5.9 Mexeu em backup/restore/DR

Leia:
- `docs/backups.md` (fonte de verdade — R2, GitHub Actions, restore, drill)
- `docs/supabase-prod-alignment.md`

### 5.10 Mexeu em fluxo de branches/PR/CI com múltiplos agentes

Leia:
- `docs/policies/POLITICA_COLABORACAO_AGENTES.md`
- `docs/policies/PREFLIGHT_EFEITOS_COLATERAIS.md`

### 5.11 Protocolo de handoff (ao CONCLUIR tarefa significativa)

Ao finalizar qualquer tarefa que toque um domínio específico, atualizar o arquivo de contexto correspondente:

```
docs/context/code-patterns.md       → mudanças em padrões de código
docs/context/resilience-patterns.md → mudanças em operações críticas
docs/context/nfe-input-flow.md      → mudanças no fluxo de NF-e
docs/context/ci-pipeline.md         → mudanças em workflows CI/CD
docs/context/integrations-testing.md → mudanças em integrações externas
```

Formato da atualização (10-20 linhas no final do arquivo):
```markdown
## Última atualização — YYYY-MM-DD
- O que mudou: <1-2 linhas>
- PRs: #NNN
- Armadilhas encontradas: <se houver>
- Estado atual: <o que é verdade agora>
```

## 6) Índice de documentos (não duplicar)

### Core (leitura obrigatória por gatilho)
- Regras de ouro / ambientes / branches: `docs/contexto-projeto-excelencia.md`
- Gates / DoD / checklist de PR: `docs/release-gate.md` + `.github/pull_request_template.md`
- RPC-first + allowlist: `docs/supabase-from-policy.md`
- Deploy/migrations: `docs/deploy.md`
- Alinhamento DEV↔PROD: `docs/supabase-prod-alignment.md`

### Memória semântica por domínio (docs/context/)
- Padrões de código: `docs/context/code-patterns.md`
- Resiliência/idempotência: `docs/context/resilience-patterns.md`
- NF-e input flow: `docs/context/nfe-input-flow.md`
- CI/CD pipeline: `docs/context/ci-pipeline.md`
- Testes de integração: `docs/context/integrations-testing.md`

### Checklists e rastreamento
- Tracker "Estado da Arte" (master): `docs/checklist-estado-da-arte-completo.md`
- Roadmap de execução (waves): `docs/ordem-estado-da-arte-execucao.md`
- Gaps operacionais (auth, UX, hooks): `docs/checklist-estado-da-arte-gaps.md`
- Marketplaces (itens pendentes): `docs/checklist-marketplaces-estado-da-arte.md`
- Go-live: `docs/go-live-checklist.md`

### Políticas e compliance
- Sanitização periódica: `docs/checklist-estado-da-arte-gaps.md`
- Política de APIs externas: `docs/policies/POLITICA_DE_APIS_EXTERNAS.md`
- Política de colaboração (múltiplos agentes): `docs/policies/POLITICA_COLABORACAO_AGENTES.md`
- Preflight anti-efeitos colaterais: `docs/policies/PREFLIGHT_EFEITOS_COLATERAIS.md`
- LGPD inventário: `docs/lgpd-01-inventario-dados-pessoais.md`
- LGPD procedimento titular: `docs/lgpd-02-procedimento-titular.md`
- Backup/restore/DR: `docs/backups.md`
- Manual do projeto (UI/UX, produto): `MANUAL-CONTEXTO-CODEX.md`

## 7) Transfer + Repo Hardening Pack

Quando abrir uma nova janela ou trocar de agente, use:
- `docs/transfer-pack/bootstrap-prompt.md`
- `docs/transfer-pack/change-inventory.md`
- `docs/transfer-pack/postmortem.md`
- `docs/transfer-pack/provas-validacao.md`
- `docs/transfer-pack/secrets-map.md`

## 8) Nova janela de contexto (passo a passo, baixo custo de tokens)

1) Copie/cole `docs/transfer-pack/bootstrap-prompt.md` no novo chat.
2) O agente deve ler **somente**:
   - `AGENTS.md` (este arquivo), e
   - os docs ativados pelo gatilho do trabalho (seção 5).
3) Para bug reports, use o template (sem logs gigantes):
   - `docs/transfer-pack/bug-report-template.md`

Regra de economia:
- não colar docs inteiros no chat;
- mandar apenas rota + ação + RPC + `request_id` + response (1 bloco) + 1 evidência (screenshot).
