# Roadmap — Indústria (UX/UI + Capabilities)

Objetivo: elevar o módulo de Indústria ao padrão de ERP/MES moderno (rápido, guiado, “paperless”, dados acionáveis) mantendo consistência visual e UX.

## Fase 1 — Fundamentos de UX (2–4 semanas)

### 1) Navegação e produtividade
- Command Palette (Ctrl/Cmd+K) com páginas + ações frequentes (criar OP/BOM/Roteiro/CT).
- Preferências persistentes por usuário/dispositivo (modo lista/kanban, filtros, centro padrão).
- Deep links compartilháveis (URL com filtros/visões) para suporte/gestão.

### 2) Padrões de UI
- Estados padrão: loading (skeleton), empty states, erro com retry.
- Componentização consistente (buttons, inputs, tables, toolbars).
- Acessibilidade mínima: navegação por teclado, foco visível, labels/ARIA.

### 3) Performance percebida
- Otimizações em listas (debounce, cache React Query onde aplicável).
- Virtualização/paginação nas telas críticas quando volume crescer.

## Fase 2 — PCP/APS “moderno” (4–8 semanas)

### 1) Planejamento de capacidade finita (APS light → APS)
- Calendários de CT (turnos, paradas planejadas, eficiência).
- Sequenciamento com restrições (setup, lote mínimo, prioridades).
- Simulação de cenários (“e se”) + impactos (atrasos, gargalos).

### 2) Replanejamento operacional
- Replanejar em massa (CT, datas, prioridades).
- Drag&drop no Gantt com validação e “undo”.

## Fase 3 — MES / Chão de Fábrica (4–10 semanas)

### 1) Execução guiada (paperless)
- Instruções/Docs por operação (já existe) com checklists e confirmação.
- Apontamento com QR/barcode (login + operação + lote) e fluxo “hands free”.
- Modo instável/offline (fila local + sync).

### 2) Andon/alertas acionáveis
- Escalonamento (notificações, responsáveis, SLA).
- Motivos de parada padronizados e registro rápido.

## Fase 4 — Qualidade & Rastreabilidade (6–12 semanas)

### 1) QMS avançado
- NCR/CAPA, workflows e assinaturas.
- SPC e amostragem (AQL/planos).

### 2) Rastreabilidade ponta-a-ponta
- Genealogia lote/serial (consumo → WIP → produto acabado → entrega).
- “Where-used” e “where-from”.

## Fase 5 — Analytics (contínuo)
- OEE (Disponibilidade/Performance/Qualidade), microparadas, paretos.
- Dashboards por CT/turno/produto + metas e alertas.

## Ordem de implementação (sugestão)
1. Fase 1.1/1.2 (ganho rápido para todos)
2. Fase 2.1 (diferencial competitivo em indústria)
3. Fase 3.1 (execução guiada + coleta)
4. Fase 4 (qualidade + rastreabilidade)
5. Fase 5 (analytics contínuo)

