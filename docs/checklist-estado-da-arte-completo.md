# Checklist “Estado da Arte” (completo, nível global) — REVO ERP

Objetivo: evoluir do **“mínimo competitivo”** (já fechado) para um produto **top mundial**, mantendo:
- **checks verdes** no GitHub
- **DEV = PROD (sem drift)**
- **zero regressões de UX/performance**

Regra de ouro:
- Toda mudança entra por `dev` → PR → `main` (deploy).
- “Feito” = passou **RG-01/RG-03/RG-04** + smoke em PROD + evidência (gif/print/link PR).

---

## 0) Fundamentos do produto (Design System + consistência)

### 0.1 Design System “de verdade”
- [x] DS-01 Tokens de design (cores, tipografia, espaçamentos, radius, shadows) centralizados e usados em tudo
- [x] DS-02 Componentes base padronizados (Button/Input/Select/Modal/Table/Toast/Skeleton) com variantes consistentes
- [ ] DS-03 Padrão de layout por módulo (header, filtros, tabela, actions, detalhes) e padrões “do Revo”
- [ ] DS-04 Ícones, estados vazios e mensagens (tom/voz) consistentes

### 0.2 UX de elite
- [ ] UX+01 Microinterações (hover/press/transition), sem flicker, com feedback previsível
- [ ] UX+02 “Zero-surpresa”: undo/confirm em ações destrutivas + “o que vai acontecer” explicado
- [ ] UX+03 “Assistentes” (wizards) para fluxos complexos (NF-e, PDV, Indústria, integrações)
- [ ] UX+04 “Resiliência”: se algo falha, o usuário sabe o que fazer (retry, logs, instrução)

### 0.3 Acessibilidade (WCAG básica/boa prática)
- [ ] A11Y-01 Navegação por teclado completa (tabs, focus trap, ESC, atalhos, skip links)
- [ ] A11Y-02 Contraste, foco visível, aria-labels em ícones e botões
- [ ] A11Y-03 Teste automatizado mínimo de acessibilidade (e2e/axe em páginas-chave)

---

## 1) Observabilidade e Operação (SRE-lite “estado da arte”)

### 1.1 Logs/Tracing/Métricas (com contexto de negócio)
- [x] OBS-01 Correlation ID (request_id) propagado: front → edge functions → DB logs
- [ ] OBS-02 Tracing por ação crítica (ex.: emitir NF, finalizar PDV, importar marketplace)
- [ ] OBS-03 Métricas de produto: tempo de carregamento, taxas de erro, funis (setup → primeira venda)
- [ ] OBS-04 Painel “Operação”: fila, falhas, webhooks, retries, status, últimos eventos

### 1.2 Alertas e SLOs (sem virar “consultoria”)
- [ ] SLO-01 Definir SLOs mínimos (ex.: erro <1% em RPCs críticas; fila < X pendentes)
- [ ] SLO-02 Alertas (Slack/email) para: queda de emissão NF, webhooks parados, backup falhando
- [ ] SLO-03 Runbooks (playbooks) para incidentes (passo a passo simples)

---

## 2) Performance “world class”

### 2.1 Front-end (percepção e realidade)
- [ ] PERF-01 Budgets (bundle/route) + alertas no CI quando crescer
- [ ] PERF-02 Skeletons bons (sem layout shift) nas listas e páginas pesadas
- [ ] PERF-03 Virtualização em listas grandes (tabela) e paginação consistente
- [ ] PERF-04 Cache e invalidação (React Query) com padrões por recurso (staleTime/retry)

### 2.2 Banco/RPC (latência e escala)
- [ ] PERF-05 Auditoria de queries RPC (EXPLAIN) em top endpoints
- [ ] PERF-06 Índices e “guard rails” (limites, paginação obrigatória, filtros)
- [ ] PERF-07 Rate limits e backoff por canal/ação (principalmente integrações)

---

## 3) Segurança e Governança (enterprise-ready)

### 3.1 RBAC/RLS e trilha de auditoria
- [ ] SEC+-01 Matriz de permissões revisada por módulo (ver/criar/editar/excluir/exportar/emitir)
- [ ] SEC+-02 Auditoria “forense”: logs importantes imutáveis/retidos (política clara)
- [ ] SEC+-03 “Least privilege”: políticas e RPCs só com permissões necessárias

### 3.2 Segredos e integrações
- [ ] SEC+-04 Rotação de secrets (NFE.io, marketplace tokens) com procedimento e “health check”
- [ ] SEC+-05 Scopes mínimos por integração (OAuth) e revogação consistente

---

## 4) Qualidade (QA) e regressão

### 4.1 Pirâmide de testes (realista)
- [ ] QA+-01 Testes de contrato para integrações (payloads reais “golden files”)
- [x] QA+-02 Regressão visual (screenshots) para páginas críticas
- [ ] QA+-03 Suite E2E por plano (Essencial/Pro/Operação/Indústria/Scale) com cenários principais e edge cases
- [ ] QA+-04 Chaos-lite: simular timeout/rate limit e validar retry/dead-letter/reprocess

### 4.2 Qualidade de migrations
- [ ] DB-01 “Idempotência garantida”: migrations repetíveis e reversíveis (quando aplicável)
- [ ] DB-02 Gate de drift (agendado) com alerta automático

---

## 5) Go-to-market (produto pronto para vender sem suporte infinito)

### 5.1 Onboarding “mágico”
- [ ] GTM-01 Wizard completo do primeiro acesso (por perfil/plano) com progresso e “próximo passo”
- [ ] GTM-02 Templates de empresa (comércio/serviços/indústria) + dados de exemplo opcionais
- [ ] GTM-03 Importadores “sem dor” (produtos/clientes) com validação e preview

### 5.2 Ajuda in-app e suporte self-serve
- [ ] GTM-04 Central de ajuda contextual (tooltips + artigos por página)
- [ ] GTM-05 Diagnóstico para o usuário (“por que não consigo emitir?”) com checklist e links diretos

---

## 6) Integrações (Marketplaces, NF-e e futuras)

### 6.1 Plataforma de integrações
- [ ] INT+-01 Rate limit por canal (throttling) + filas separadas + backoff com jitter
- [ ] INT+-02 Reprocessamento com “simulação” (dry-run) e logs detalhados
- [ ] INT+-03 Versionamento de adaptadores (migração de payloads sem quebrar)

### 6.2 Marketplaces (ecommerce)
- [ ] MELI+-01 Webhooks completos + import incremental + expedição + estoque (com guardrails)
- [ ] SHO+-01 OAuth real + pedidos + webhooks + expedição + estoque (com guardrails)

### 6.3 NF-e (fiscal)
- [ ] NFE+-01 Cobertura de edge cases (rejeições comuns, contingência, reprocessos)
- [ ] NFE+-02 Relatórios fiscais mínimos + export/arquivo quando aplicável

---

## Ordem recomendada (para manter velocidade sem perder excelência)
1) DS-01..DS-04 + UX+01..UX+04 (consistência)
2) OBS-01..OBS-04 + SLO-01..SLO-03 (operação previsível)
3) PERF-01..PERF-07 (evita “ERP lento”)
4) QA+-01..QA+-04 (regressão sob controle)
5) GTM-01..GTM-05 (reduz suporte e acelera adoção)
6) INT+ e integrações por canal (escala com segurança)

---

## Definição prática de “Estado da Arte” (para o Revo)
Consideramos **Estado da Arte** quando:
- O usuário novo configura e faz a **primeira venda** sem pedir ajuda
- As ações críticas são **idempotentes**, auditáveis e com feedback perfeito
- A operação tem **observabilidade + alertas** (antes do cliente reclamar)
- O app é **rápido** em empresas com dados reais
- Todo merge mantém **checks verdes** e **sem drift**
