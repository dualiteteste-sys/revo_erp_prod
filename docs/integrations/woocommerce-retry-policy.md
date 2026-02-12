# WooCommerce Retry Policy

## Classificacao de erro

- `401` -> `WOO_AUTH_INVALID`
  - Nao retry imediato.
  - Store marcada como `paused`.
  - Hint: revisar CK/CS, HTTPS, proxy/WAF e Authorization header.

- `403` -> `WOO_AUTH_FORBIDDEN`
  - Nao retry imediato.
  - Store marcada como `paused`.
  - Hint: revisar permissões da chave, proxy/WAF e bloqueios de IP.

- Compatibilidade retroativa: `WOO_AUTH_FAILED` continua reconhecido como erro de auth.

- `404` -> `WOO_RESOURCE_NOT_FOUND`
  - Nao retry automatico agressivo.
  - Hint: map desatualizado, rebuild de product map.

- `429` -> `WOO_RATE_LIMIT`
  - Retry com backoff exponencial + jitter.

- `5xx` -> `WOO_REMOTE_UNAVAILABLE`
  - Retry com backoff exponencial + jitter.

## Backoff

- Base: 30s.
- Exponencial por tentativa.
- Cap: 60 minutos.
- Jitter: ate 2s.

## Dead-letter

- `woocommerce_sync_job_complete` move para `dead` ao atingir `max_attempts`.
- Jobs em `dead` exigem acao manual (replay/requeue apos correcao da causa).
- O painel Woo permite `stores.jobs.requeue` por `job_id` (somente status `dead`).

## Locks e concorrencia

- Claim considera uma unidade por `(store_id, type)` em cada ciclo.
- Jobs `running` com lock stale (>10 min) podem ser reclamados novamente.
