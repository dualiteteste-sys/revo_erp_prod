# WooCommerce `stores.status` — exemplos reais

Exemplos gerados automaticamente pelo teste:

- `src/lib/integrations/woocommerce/__tests__/statusExamples.test.ts`
- snapshot fonte: `src/lib/integrations/woocommerce/__tests__/__snapshots__/statusExamples.test.ts.snap`

Timestamp da geração: `2026-02-12T12:00:00.000Z`

## A) Store saudável

```json
{
  "health": { "store_status": "active", "queue_lag_seconds": 0, "last_webhook_seconds": 60, "order_import_lag_seconds": 90, "is_degraded": false },
  "queue": { "queued": 0, "running": 1, "error": 0, "dead": 0, "pending_total": 0, "inflight_total": 1 },
  "webhooks": { "recent_total": 2, "queued": 0, "done": 2, "invalid_or_error": 0, "dropped": 0, "last_received_at": "2026-02-12T11:59:00.000Z" },
  "orders": { "imported_total_seen": 1, "last_woo_updated_at": "2026-02-12T11:58:30.000Z", "import_lag_seconds": 90 },
  "map_quality": { "total": 20, "missing_revo_map": 0, "duplicated_skus": 0 },
  "recommendations": []
}
```

## B) Store pausada por AUTH_FAILING

```json
{
  "health": { "store_status": "paused", "queue_lag_seconds": 0, "last_webhook_seconds": 60, "order_import_lag_seconds": 90, "is_degraded": true },
  "queue": { "queued": 0, "running": 0, "error": 2, "dead": 0, "pending_total": 2, "inflight_total": 0 },
  "recent_errors": [
    { "code": "WOO_AUTH_FORBIDDEN", "message": "job_failed", "hint": "Revise credenciais", "at": "2026-02-12T11:59:30.000Z" }
  ],
  "recommendations": [
    "Store pausada. Corrija credenciais e rode healthcheck.",
    "Falha de autenticação/autorização Woo detectada. Revise credenciais e proxy/WAF."
  ]
}
```

## C) Store com WORKER_LAG

```json
{
  "health": { "store_status": "active", "queue_lag_seconds": 4800, "last_webhook_seconds": 60, "order_import_lag_seconds": 90, "is_degraded": true },
  "queue": { "queued": 18, "running": 0, "error": 2, "dead": 1, "pending_total": 20, "inflight_total": 0 },
  "recommendations": ["Existem jobs em dead-letter. Reprocessar apos correcao."]
}
```

## D) Store com MAP_CONFLICTS

```json
{
  "health": { "store_status": "active", "queue_lag_seconds": 0, "last_webhook_seconds": 60, "order_import_lag_seconds": 90, "is_degraded": false },
  "map_quality": { "total": 120, "missing_revo_map": 6, "duplicated_skus": 2 },
  "recommendations": ["Conflitos de SKU detectados. Execute product_map.build."]
}
```
