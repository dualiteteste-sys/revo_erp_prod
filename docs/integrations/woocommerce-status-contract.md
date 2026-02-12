# WooCommerce Status Contract (`stores.status`)

Contrato estável v1 retornado por `woocommerce-admin` na ação:

```json
{ "action": "stores.status", "store_id": "<uuid>" }
```

## Compatibilidade

- Campos legados continuam:
  - `store`
  - `webhook_events`
  - `jobs`
  - `logs`
  - `health`
  - `map_quality`
  - `recommendations`
- Campos novos adicionados sem quebra:
  - `queue`
  - `webhooks`
  - `orders`
  - `recent_errors`
  - `status_contract`

## Estrutura canônica (`status_contract`)

- `version`: versão do contrato (`v1`)
- `generated_at`: timestamp ISO
- `error_catalog_version`: versão do catálogo de códigos de erro
- `store`: dados básicos da loja (status/base_url/auth/last_healthcheck)
- `health`:
  - `store_status`
  - `queue_lag_seconds`
  - `last_webhook_seconds`
  - `order_import_lag_seconds`
  - `is_degraded`
- `queue`:
  - `queued`, `running`, `error`, `dead`
  - `pending_total`, `inflight_total`
- `webhooks`:
  - `recent_total`, `queued`, `done`, `invalid_or_error`, `dropped`, `last_received_at`
- `orders`:
  - `imported_total_seen`
  - `last_woo_updated_at`
  - `import_lag_seconds`
- `map_quality`:
  - `total`, `missing_revo_map`, `duplicated_skus`
- `recommendations`: lista de hints acionáveis
- `recent_errors`: últimos erros normalizados com `code/hint/message`

## Garantia operacional

Falhas relevantes devem aparecer em:
1. `woocommerce_sync_log` com `meta.code` e `meta.hint`
2. `stores.status` em `recent_errors`, além de impacto em `health/recommendations`
