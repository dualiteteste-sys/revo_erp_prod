# Master Checklist “Estado da Arte” (completo) — REVO ERP

Este é o checklist único (por módulo) para levar o REVO ao nível **top mundial**, com:
- UI/UX moderna e consistente
- Segurança (AppSec + multi-tenant/RLS) sem bypass via console
- Performance, confiabilidade e escalabilidade
- Observabilidade (logs, métricas, tracing)
- Testabilidade (CI forte, regressão sob controle)
- LGPD/privacidade e eficiência operacional (FinOps)

## Como usar (regra do jogo)
- Toda mudança entra por `dev` → PR → `main`.
- “Feito” = evidência + validação + checks verdes:
  - `RG-01` (unit) + `RG-04` (E2E gates) + `verify:migrations`
  - `RG-03` (console limpo no fluxo coberto)
  - Smoke em PROD (quando aplicável)

## Legenda
- Prioridade: `P0` (vender/evitar suporte), `P1` (diferencial), `P2` (polimento/escala)
- Status: `[ ]` pendente, `[x]` concluído
- Formato: `COD-XXX (P#)` — descrição curta
- Validação: sempre que possível, indicar **como validar** (passos + onde olhar).

## Baseline já fechado (mínimo competitivo)
- [x] BASE-00 (P0) “Mínimo Estado da Arte” concluído (ver `docs/checklist-estado-da-arte-minimo.md`)

---

## A) Plataforma (Design System + UX + A11y)

### A1) Design System real (tokens + componentes)
- [x] PLAT-DS-01 (P0) Tokens de design centralizados e aplicados (cores, tipografia, espaçamentos, radius, shadows)
- [x] PLAT-DS-02 (P0) Componentes base padronizados (Button/Input/Select/Modal/Table/Toast/Skeleton) com variantes
- [x] PLAT-DS-03 (P0) Template de layout por módulo (header/filtros/tabela/actions/detalhes) aplicado nos módulos-chave
- [x] PLAT-DS-04 (P0) Estados vazios, mensagens e tom/voz consistentes

**Validar**
- Navegar em 5 módulos diferentes e confirmar: layout consistente, EmptyState com CTA, botões/inputs com mesmo comportamento.

### A2) UX “Estado da Arte”
- [ ] PLAT-UX-01 (P1) Microinterações consistentes (hover/press/transition) sem flicker/layout shift
- [ ] PLAT-UX-02 (P0) Ações destrutivas com “zero-surpresa”: undo/confirm + explicação clara
- [ ] PLAT-UX-03 (P0) Feedback resiliente: retry, “o que fazer agora”, link para logs/diagnóstico quando falhar
- [ ] PLAT-UX-04 (P1) Fluxos complexos com assistentes (wizard) por contexto (NF-e, PDV, Indústria, Integrações)

**Validar**
- Forçar erro (desligar rede / provocar 400) e confirmar que existe caminho de recuperação sem alert()/travamento.

### A3) Acessibilidade (WCAG pragmático)
- [ ] PLAT-A11Y-01 (P1) Navegação por teclado completa (focus trap, ESC, tab order, atalhos)
- [ ] PLAT-A11Y-02 (P1) Contraste e foco visível + aria-labels em ícones
- [ ] PLAT-A11Y-03 (P2) Smoke automatizado de A11y (axe) em páginas-chave

---

## B) Segurança / AppSec / Multi-tenant / Governança

### B1) Multi-tenant “sem bypass”
- [x] SEC-MT-01 (P0) Checklist de isolamento por recurso: todo dado tem `empresa_id` + RLS consistente
- [x] SEC-MT-02 (P0) RPCs `security definer` com `require_permission_for_current_user` quando expostos
- [x] SEC-MT-03 (P0) “Sem bypass via console”: nenhuma tabela crítica exposta sem RLS/RPC wrapper
- [x] SEC-MT-04 (P1) Testes automatizados de isolamento (tentativa cross-empresa deve falhar)

**Validar**
- Teste e2e/fixture com 2 empresas: tentar ler/alterar registros da empresa B usando sessão da A (deve falhar).

### B2) RBAC de verdade
- [x] SEC-RBAC-01 (P0) Matriz de permissões revisada por módulo (view/create/update/delete/manage/export)
- [x] SEC-RBAC-02 (P0) Enforcement em 3 camadas: menu + rotas + DB (RLS/RPC)
- [ ] SEC-RBAC-03 (P1) Perfis prontos (Owner/Admin/Finance/Ops/Member/Viewer) + auditoria de mudanças

### B3) Segredos e integrações (segurança operacional)
- [ ] SEC-INT-01 (P0) Rotação de tokens (NFE.io/marketplaces) com procedimento e “health check”
- [ ] SEC-INT-02 (P0) Revogação (disconnect) consistente + limpeza de secrets
- [ ] SEC-INT-03 (P1) Scopes mínimos por integração (OAuth) e auditoria de acessos

### B4) Privacidade/LGPD (mínimo vendável)
- [ ] LGPD-01 (P0) Inventário de dados pessoais (campos, finalidade, base legal, retenção)
- [ ] LGPD-02 (P0) Export do titular (dados do usuário/empresa) + trilha do que foi exportado
- [ ] LGPD-03 (P0) Retenção/expurgo (política) + execução segura (soft delete onde precisa)
- [ ] LGPD-04 (P1) Minimização de logs: payload saneado e sem PII sensível

---

## C) Observabilidade / SRE-lite

### C1) Logs, métricas e tracing
- [x] OBS-LOG-01 (P0) Correlation ID propagado (front → edge → DB) em ações críticas
- [x] OBS-TRC-01 (P0) Tracing por ação crítica (emitir NF, PDV, importar marketplace, finalizar recebimento)
- [ ] OBS-MET-01 (P0) Métricas de produto (latência, taxa de erro, tempo de first value)
- [ ] OBS-MET-02 (P1) KPIs de negócio: funil (setup → 1ª venda → 1ª NF → 1º pagamento)
- [ ] OBS-OPS-01 (P0) Painel “Operação” (Dev → Saúde): filas, falhas, retries, webhooks, últimos eventos

**Validar**
- Tela “Saúde” mostra: últimas falhas, fila pendente, e link para logs por entidade.

### C2) SLO/alertas/runbooks
- [ ] SRE-01 (P0) SLOs mínimos (erro RPC <1%, fila < X, emissão NF success rate)
- [ ] SRE-02 (P0) Alertas (email/Slack) para quedas críticas (NF, fila, backups, drift)
- [ ] SRE-03 (P1) Runbooks simples (playbooks) por incidente

---

## D) Performance / Eficiência

### D1) Front-end
- [ ] PERF-FE-01 (P0) Budgets (bundle/route) no CI com falha quando estourar
- [ ] PERF-FE-02 (P1) Virtualização para listas grandes (tabelas críticas)
- [ ] PERF-FE-03 (P0) Padrão de cache/invalidação (React Query) por recurso
- [ ] PERF-FE-04 (P1) Lighthouse budget (Perf/A11y/Best Practices) para landing + app shell

### D2) Banco/RPC
- [ ] PERF-DB-01 (P0) EXPLAIN/índices nos top RPCs (vendas, estoque, financeiro, indústria)
- [ ] PERF-DB-02 (P0) Guard rails: paginação obrigatória + limites + filtros no backend
- [ ] PERF-DB-03 (P1) Rate limit/backoff por canal/ação (integrações, emissão)

### D3) FinOps (eficiência operacional)
- [ ] FINOPS-01 (P1) Telemetria de custo: jobs, webhooks, filas (volume) por empresa
- [ ] FINOPS-02 (P1) Limites por plano com enforcement real e alertas (evitar suporte)

### D4) Resiliência / Escalabilidade (sem “ERP frágil”)
- [ ] RES-01 (P0) Idempotência padrão em ações críticas (idempotency key + dedupe no backend)
- [ ] RES-02 (P0) Retry padrão com backoff+jitter (HTTP/RPC/filas) + limites (não “loop infinito”)
- [ ] RES-03 (P0) Timeouts consistentes por camada (front/edge/RPC) + cancelamento (AbortController)
- [ ] RES-04 (P0) Filas por domínio (NF/marketplace/financeiro) com DLQ + reprocessamento seguro
- [ ] RES-05 (P0) “Anti double-click”/locks por entidade (ex.: emitir NF, fechar caixa, finalizar OS)
- [ ] RES-06 (P1) Circuit breaker + bulkheads (evitar efeito cascata quando integração cair)
- [ ] RES-07 (P1) Degradação elegante (feature off / fallback) + mensagens “o que fazer agora”
- [ ] RES-08 (P1) Teste de carga mínimo (Top 5 RPCs + 2 fluxos E2E) com budget de latência
- [ ] RES-09 (P1) Multitenancy-friendly scaling: filas/locks/limites por empresa (não “uma empresa derruba todas”)

**Validar**
- Desligar a integração (simular 500/timeout) e confirmar: retries limitados, DLQ, reprocess, UI não trava.
- Rodar o teste de carga e confirmar budget de latência e taxa de erro aceitáveis.

---

## E) Qualidade (QA) / Regressão / Migrations

### E1) Testes
- [ ] QA-CT-01 (P0) Testes de contrato de integrações (golden files payloads reais)
- [x] QA-VIS-01 (P1) Regressão visual (screenshots) para páginas críticas
- [ ] QA-E2E-01 (P0) Suites E2E por plano (Essencial/Pro/Max/Indústria/Scale) com edge cases
- [ ] QA-CHAOS-01 (P1) Chaos-lite: timeout/rate-limit/retry/dead-letter/reprocess

### E2) Banco e deploy
- [ ] DB-MIG-01 (P0) Idempotência “garantida”: migrations repetíveis (e reversão quando fizer sentido)
- [ ] DB-DRIFT-01 (P0) Drift gate agendado com alerta (DEV vs PROD) e bloqueio quando necessário
- [ ] DB-RPC-01 (P0) Cobertura RPC app ↔ migrations sempre verde (sem função “fantasma”)

---

## F) Go-to-market (onboarding e suporte self-serve)

### F1) Primeiro uso guiado (opt-in e sem travar)
- [x] GTM-ONB-01 (P0) Roadmap por grupo de módulos (opt-in) com checks automáticos e links corretos
- [ ] GTM-ONB-02 (P0) Roadmap por plano: recomendações e “próximo passo” (só mostra o que faz sentido)
- [ ] GTM-ONB-03 (P1) Importadores sem dor (clientes/produtos) com preview + validação + rollback

### F2) Ajuda e diagnóstico
- [ ] GTM-HELP-01 (P1) Ajuda contextual (tooltips + artigos por página)
- [ ] GTM-HELP-02 (P0) Diagnóstico “por que não funciona?” com checklist + links (NF/PDV/integrações)

---

## G) Módulos do ERP (por domínio)

### G1) Cadastros
- [ ] CAD-STA-01 (P0) CRUDs com validação forte + import/export (clientes, produtos, serviços, transportadoras)
- [ ] CAD-STA-02 (P1) Normalização tributária básica (NCM/CFOP/CST/CSOSN) e consistência de unidade/sku
- [ ] CAD-STA-03 (P1) Dedupe e saneamento (CNPJ/CPF/email/telefone) com alertas de duplicidade

### G2) Suprimentos / Estoque
- [ ] SUP-STA-01 (P0) Multi-estoque/depósitos + transferências + permissões por local
- [ ] SUP-STA-02 (P0) Inventário cíclico (contagem → divergência → aprovação → ajuste auditável)
- [ ] SUP-STA-03 (P1) Devolução ao fornecedor (reversão) vinculada a OC/recebimento
- [ ] SUP-STA-04 (P1) Landed cost (rateio frete/impostos) com impacto em custo médio/relatórios
- [ ] SUP-STA-05 (P1) Sugestão de compra (mín/máx + lead time + OCs abertas) “MRP-lite”
- [ ] SUP-STA-06 (P1) WMS light (leitura barcode/QR na conferência/separação) + checklists

### G3) Vendas / PDV / Expedição
- [ ] VEN-STA-01 (P0) Regras de preço/desconto com permissão + trilha (quem deu desconto)
- [ ] VEN-STA-02 (P0) PDV resiliente (offline-lite, retry idempotente, fila local) quando fizer sentido
- [ ] VEN-STA-03 (P1) Expedição com eventos, rastreio, SLA e relatórios (atrasos/pendências)
- [ ] VEN-STA-04 (P1) Multi-caixa (PDV) + perfis por caixa + fechamento

### G4) Fiscal (NF-e)
- [ ] NFE-STA-01 (P0) Catálogo de rejeições + “o que fazer” + reprocessos guiados
- [ ] NFE-STA-02 (P1) Contingência e retomada segura (quando aplicável)
- [ ] NFE-STA-03 (P1) Relatórios fiscais mínimos + export/arquivos (quando aplicável)

### G5) Serviços / OS (assistência técnica)
- [ ] OS-STA-01 (P0) Cadastro de equipamento (modelo/serial/IMEI/acessórios/garantia/fotos) vinculado cliente↔OS
- [ ] OS-STA-02 (P0) Atribuição por técnico + fila por técnico + visão mobile/tablet
- [ ] OS-STA-03 (P0) Fluxo de orçamento/aprovação (enviar/aprovar/reprovar) com registro de aceite
- [ ] OS-STA-04 (P1) Checklists por tipo de serviço (diagnóstico→execução→teste→entrega) com “done” automático
- [ ] OS-STA-05 (P1) Comunicação (WhatsApp/email) com templates + log + portal simples do cliente

### G6) Financeiro
- [ ] FIN-STA-01 (P0) Conciliação por extrato com matching sugerido + regras e auditoria
- [ ] FIN-STA-02 (P1) Centro de custo por lançamento + relatórios gerenciais (DRE simplificada)
- [ ] FIN-STA-03 (P1) Cobranças: remessa/retorno bancário (quando aplicável) e automações de cobrança

### G7) Indústria
- [ ] IND-STA-01 (P0) Capacidade/PCP e MRP “operável” (não só tela) com sugestões e alertas
- [ ] IND-STA-02 (P1) Apontamentos com rastreio por lote/qualidade e custos (fase 2)
- [ ] IND-STA-03 (P1) Dashboards industriais (OEE-lite, filas, WIP, atrasos) com drill-down

### G8) RH & Qualidade
- [ ] RH-STA-01 (P1) Trilhas e compliance de treinamentos (vencimentos, alertas, evidência)
- [ ] RH-STA-02 (P1) Matriz de competências utilizável (gap, plano de ação, histórico)

### G9) Configurações / Administração
- [ ] ADM-STA-01 (P0) Usuários, papéis e permissões “sem fricção” (scroll ok, busca, presets)
- [ ] ADM-STA-02 (P0) Planos/Limites por empresa com enforcement 3 camadas (UI/Rotas/DB)
- [ ] ADM-STA-03 (P1) Multiunidade/filiais (quando aplicável): escopo claro + permissões
- [ ] ADM-STA-04 (P1) Auditoria de mudanças administrativas (quem mudou o quê e quando)

### G10) Assinatura / Billing (Stripe)
- [ ] BILL-STA-01 (P0) Ciclo completo de trial → ativo → inadimplente → bloqueio suave → cancelado
- [ ] BILL-STA-02 (P0) Webhooks Stripe idempotentes + trilha por evento (reprocessável)
- [ ] BILL-STA-03 (P1) Proration/upgrade/downgrade com comunicação clara + histórico
- [ ] BILL-STA-04 (P1) “Self-serve” de faturas/boletos/recibos (quando aplicável) e dados fiscais

### G11) Suporte (reduzir suporte humano)
- [ ] SUPP-STA-01 (P0) Ajuda contextual por página (o que é + 3 passos + links) sem abrir ticket
- [ ] SUPP-STA-02 (P1) Coleta de diagnóstico (últimas falhas, correlation id) anexável ao suporte
- [ ] SUPP-STA-03 (P1) Central de notificações (incidentes, mudanças fiscais, integrações) com histórico

### G12) Desenvolvedor (Operação interna)
- [ ] DEV-STA-01 (P0) Logs do usuário/empresa com filtros (ação, data, status) e drill-down por entidade
- [ ] DEV-STA-02 (P0) Monitor “Saúde” (filas, DLQ, falhas, webhooks, jobs) com reprocess/dry-run
- [ ] DEV-STA-03 (P1) Ferramentas de diagnóstico de schema/RPC (drift, migrations pendentes, cache)

---

## H) Integrações (plataforma)
- [ ] INT-STA-01 (P0) Rate limit por canal + filas separadas + backoff com jitter
- [ ] INT-STA-02 (P0) Reprocessamento seguro (dry-run, replay, dead-letter) com trilha por entidade
- [ ] INT-STA-03 (P1) Versionamento de adaptadores (migração de payloads sem quebrar)
- [ ] INT-STA-04 (P1) Health por conexão (token expirado, webhook parado, atraso de fila)

---

## Ordem recomendada (para entrar forte no mercado)
1) `SEC-*` + `OBS-*` + `GTM-*` (reduz suporte e evita incidentes)
2) Suprimentos (multi-estoque + inventário) e Serviços (assistência técnica) — dois nichos fortes
3) Performance budgets e guard rails (evita “ERP lento”)
4) Integrações (marketplaces) com plataforma robusta
