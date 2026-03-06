# Plano de Execução — Revo ERP

Documento vivo. Atualizado a cada tarefa concluída.

- `[x]` = Concluído e mergido em `main`
- `[ ]` = Pendente

---

## Bloco A — Infraestrutura de Desenvolvimento

Objetivo: dar ao agente condições de operar com autonomia, segurança e memória entre sessões.

### A1 — Qualidade de CI/CD

- [x] **F2.1** TruffleHog secret scanning no `release-gate-dev.yml` (`--only-verified`) — PR #889
- [x] **F2.2** Smoke test pós-deploy no `netlify-deploy-dev.yml` (6 tentativas × 10s, HTTP 200) — PR #889
- [x] **F0.1** Sentry `tracesSampleRate` 1.0 → 0.1 em prod (economiza ~90% de quota) — PR #889

### A2 — Memória semântica (docs/context/)

- [x] **F1.1** Criar `docs/context/` com 5 arquivos de contexto por domínio — PR #889
  - [x] `code-patterns.md` — camadas, TypeScript, React Query, naming, SOLID/DRY/KISS
  - [x] `resilience-patterns.md` — double-submit, idempotência, retry, timeout, circuit breaker
  - [x] `nfe-input-flow.md` — fluxo 5-step, RPCs, bugs históricos, armadilhas
  - [x] `ci-pipeline.md` — workflows, tempos, gates, secrets, otimizações
  - [x] `integrations-testing.md` — Stripe, Focus NF-e, WooCommerce, ML/Shopee, ngrok
- [x] **F1.2** `AGENTS.md` §5 atualizado com gatilhos e protocolo de handoff — PR #889
- [x] **F1.3** `MEMORY.md` atualizado com tabela semântica por trigger — PR #889

### A3 — Organização de documentação

- [x] **F0.2** Remover 3 docs redundantes/deprecated (`CHECKLIST-ESTADO-DA-ARTE.md`, `checklist-estado-da-arte-minimo.md`, `checklist-go-live.md`) — PR #889
- [x] **F0.4** Fundir `docs/backup-restore.md` → `docs/backups.md` (fonte única) — PR #889
- [x] **F3.2** Criar `docs/lgpd-02-procedimento-titular.md` (SOP: acesso, correção, exclusão, portabilidade) — PR #889

### A4 — Autonomia do agente

- [x] `.claude/settings.json` — padrões amplos (`git *`, `gh *`, `yarn *`, `python3 *`, etc.) substituem lista de comandos específicos — sessão 2026-03-06
- [x] `defaultMode` `plan` → `default` — agente não precisa mais de aprovação para cada step do workflow dev

---

## Bloco B — Produto: NF-e (Emissão)

Objetivo: NF-e emitida sem suporte manual. Do cadastro do emitente até a rejeição tratada.

### B1 — Dados do emitente e configuração

- [x] Ler `pessoa_enderecos` para preenchimento do emitente (antes lia campo plano) — PR #853
- [x] Enriquecer erro de CNPJ do emitente com diagnóstico (campo exato, valor atual, o que falta) — PR #855
- [x] UI completa de configurações do emitente (todos os campos fiscais editáveis) — PR #883
- [x] Migration: sincronizar `fiscal_nfe_emitente` CNPJ + endereço a partir da tabela `empresas` — PR #869
- [x] Query robusta do emitente (FK join em vez de RPC dupla) — PR #868
- [x] Fallback: endereço emitente cai para `empresas` quando `fiscal_nfe_emitente` está nulo — PR #866

### B2 — Regras fiscais e indicadores

- [x] Lógica correta do indicador IE (`1` = contribuinte ICMS, `9` = não contribuinte) — PR #878
- [x] Indicador IE: IE preenchida sempre usa `1` para contribuinte ICMS — PR #878
- [x] Integração da IE na Consulta CNPJ via cnpj.ws — PR #880

### B3 — Status e polling

- [x] Sincronizar status da NF-e a partir da API Focus NF-e no poll — PR #876
- [x] Estado `processando` com polling visual (spinner + badge) — PR #871

### B4 — UX e observabilidade

- [x] Fix modal flutuante de erros: bug de encolhimento + botão "Copiar Todos" — PR #857
- [x] React Router v7 future flags habilitados (sem warnings) — PR #858

### B5 — NF-e de entrada (XML de fornecedores)

- [x] Fluxo 5-step de importação de XML NF-e — PR #885, #887
- [x] Lote rastreável end-to-end via `<rastro>` do XML — PR #885
- [x] Fix cascade-delete, badges de status, match por Cód/EAN — PR #887

### B6 — Rejeições, contingência e relatórios

- [x] **NFE-STA-01 (P0)** Catálogo de rejeições SEFAZ + "o que fazer" + reprocesso guiado — PR #892
- [x] **NFE-STA-02 (P1)** Contingência e retomada segura (SEFAZ indisponível) — PR #892
- [x] **NFE-STA-03 (P1)** Relatórios fiscais mínimos + export CSV — PR #892

---

## Bloco C — Produto: Busca e Cadastros

- [x] Busca insensível a acento em todos os RPCs de texto — PR #860
- [x] Fix `partners_search_match` IMMUTABLE → STABLE + `cliente` obrigatório em AR — PR #862
- [x] Prevenir wildcard `%` quando termo de busca não tem dígitos — PR #864

---

## Bloco D — Produto: Suprimentos

- [x] Lote rastreável: campo `n_lote` + `match_strategy` no fluxo de importação XML — PR #885, #887

---

## Próximos itens (ordem de execução)

| # | Item | Prioridade | Bloco |
|---|------|-----------|-------|
| 1 | Bloco B completo — definir próximos de produto | — | — |

---

## Referências

- Checklist produto completo: `docs/checklist-estado-da-arte-completo.md`
- Roadmap de waves (longo prazo): `docs/ordem-estado-da-arte-execucao.md`
- Arquitetura CI/CD: `docs/context/ci-pipeline.md`
- Padrões de código: `docs/context/code-patterns.md`
- NF-e fluxo de entrada: `docs/context/nfe-input-flow.md`

---

## Última atualização — 2026-03-06

- Bloco A concluído (PR #889, merge dev+main)
- Autonomia do agente configurada (`.claude/settings.json`)
- Bloco B1–B5 concluído (PRs #853–#887)
- Bloco B6 concluído: NFE-STA-01/02/03 (PR #892, merge dev)
