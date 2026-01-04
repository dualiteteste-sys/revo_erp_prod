# SRE-01 — SLOs mínimos (REVO ERP)

Este documento define SLOs pragmáticos para evitar “ERP frágil” e reduzir suporte.

## Objetivo
- Detectar degradação antes do cliente reclamar.
- Guiar decisões de prioridade (o que corrigir primeiro).
- Ter thresholds claros (alerta) e um lugar único para checar saúde.

## Fonte de dados (hoje)
- **Filas/DLQ**: tabelas de jobs (`fiscal_nfe_webhook_events`, `finance_jobs`, `ecommerce_jobs`) + DLQs.
- **Métricas de RPC**: eventos em `public.app_logs` com `event = 'metric.rpc'` e `context.duration_ms`.
- **Primeiro valor**: `event = 'metric.first_value'` com `context.value_ms`.
- **Painel único**: `Dev → Saúde` (UI) e workflow `OPS health alert (PROD)` (GitHub).

## SLOs (mínimos)

### 1) Filas e DLQ (P0)
- **DLQ**: `0` (qualquer item em DLQ é alerta).
- **Jobs failed**: `0` (falhas devem ser retriadas/reprocessadas; falha persistente vira incidente).
- **Pendências**: `<= 200` itens “prontos para processar” por 15 min.

### 2) Latência e taxa de erro (P0)
Janela: 15 minutos.
- **RPC p95**: `<= 2000ms` (acima disso é degradação perceptível).
- **RPC erro**: `<= 1%` (considerando `metric.rpc ok=false`).
- **Amostra mínima**: só alertar quando `>= 30` métricas na janela (evita ruído).

### 3) Tempo para “primeiro valor” (P1)
Janela: 24 horas.
- **First value (mínimo)**: indicador de “tempo até funcionar” após login.
- Meta inicial: **<= 3 minutos** (ajustar após medir de verdade).

## Onde os SLOs são verificados
- GitHub: `.github/workflows/ops-health-alert-prod.yml` (15 em 15 min)
- UI: `Dev → Saúde` (cards + DLQ/reprocesso)

## Como ajustar thresholds
1) Alterar variáveis do workflow `OPS health alert (PROD)`.
2) Revisar este documento para manter a regra clara.

