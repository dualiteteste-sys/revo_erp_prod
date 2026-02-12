# WooCommerce Scheduler (execução real)

## Objetivo

Executar automaticamente o `woocommerce-worker` para drenar a fila sem depender de ação manual no painel.

## Segurança

- Endpoint: `POST {SUPABASE_URL}/functions/v1/woocommerce-scheduler`
- Header obrigatório: `x-woocommerce-scheduler-key`
- Respostas de autenticação:
  - sem chave: `401 SCHEDULER_UNAUTHENTICATED`
  - chave inválida: `403 SCHEDULER_FORBIDDEN`

## GitHub Actions (cron)

Workflow: `.github/workflows/woocommerce-scheduler.yml`

- Frequência: `*/5 * * * *`
- Concurrency: evita execuções sobrepostas.
- Usa `curl --fail-with-body` + timeout.

## Secrets necessários no GitHub

- `SUPABASE_URL`
- `WOOCOMMERCE_SCHEDULER_KEY`

> Nunca versionar valores reais de secret.

## Observabilidade

- Scheduler registra `scheduler_tick` em `woocommerce_sync_log` por store processada.
- Em falha de worker, registra `scheduler_tick_failed` com `code` e `hint`.
- Campos úteis no `meta`: `processed_jobs`, `duration_ms`, `limit`, `max_batches`.

## Debug rápido

1. Verificar últimas execuções no workflow `woocommerce-scheduler`.
2. Abrir painel Woo da store e conferir `Logs` para `scheduler_tick`/`scheduler_tick_failed`.
3. Se falhar autenticação, validar secret `WOOCOMMERCE_SCHEDULER_KEY` no GitHub e no Supabase.
