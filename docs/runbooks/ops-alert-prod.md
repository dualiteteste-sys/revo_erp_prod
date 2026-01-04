# Runbook — OPS ALERT (PROD): filas/DLQ/SLO

Este runbook cobre a Issue criada automaticamente com label `ops-alert`.

## 1) Entender o alerta (2 minutos)
Abra a Issue e veja os números:
- `pending_max`, `failed_sum`, `dlq_sum`
- `rpc_p95_ms_15m`, `rpc_error_rate_pct_15m`, `rpc_count_15m`

## 2) Abrir o painel “single place”
No app, vá em `Dev → Saúde`.

Você deve ver:
- Contadores (NFE.io, Financeiro, Marketplaces)
- DLQs (financeiro / marketplaces)
- Lista de falhas recentes

## 3) Ações recomendadas (do mais comum ao mais grave)

### A) DLQ > 0 (prioridade máxima)
1) Em `Dev → Saúde`, abra a lista de DLQ.
2) Clique em **Reprocessar** nos itens.
3) Se voltar para DLQ, leia o `last_error` e crie correção (migration/código).

### B) `failed_sum > 0` (jobs em erro)
1) Identifique o domínio (NF/finance/ecommerce).
2) Reprocessar com segurança (botões do painel).
3) Checar se existe dependência faltando (ex.: config, permissões, secrets).

### C) `pending_max` alto (backlog)
1) Verificar se o worker está rodando (Actions do worker ou scheduler).
2) Verificar se há locks presos (campo `locked_at` recente).
3) Se for pico esperado: aumentar capacidade (frequência do worker) e/ou otimizar RPC.

### D) RPC p95 alto / erro > 1%
1) Abrir `Dev → Logs` e filtrar por `metric.rpc` e erros recentes.
2) Identificar o RPC mais chamado (campo `fn` no contexto).
3) Próximas ações:
   - Ajustar índices / otimizar RPC (PERF-DB-01)
   - Reduzir payload / paginação (já temos guard rails)

## 4) Encerramento
O workflow fecha a Issue automaticamente quando os números voltarem ao normal.

Se o problema for intermitente, deixe um comentário na Issue com:
- causa raiz
- fix aplicado (PR + migration)
- prevenção (ex.: limite, retry, alert threshold)

