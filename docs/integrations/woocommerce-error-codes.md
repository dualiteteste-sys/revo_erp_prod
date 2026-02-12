# WooCommerce Error Codes (catálogo)

Versão do catálogo: `2026-02-12.phase3`

## Códigos

- `WOO_AUTH_INVALID`
- `WOO_AUTH_FORBIDDEN`
- `WOO_AUTH_FAILED` (legado/compatibilidade)
- `WOO_RATE_LIMIT`
- `WOO_REMOTE_UNAVAILABLE`
- `WOO_RESOURCE_NOT_FOUND`
- `WOO_VALIDATION_FAILED`
- `WOO_UNEXPECTED`
- `STORE_URL_REQUIRED`
- `STORE_URL_MUST_USE_HTTPS`
- `STORE_URL_CREDENTIALS_NOT_ALLOWED`
- `STORE_URL_INVALID_HOST`
- `STORE_URL_PRIVATE_HOST_BLOCKED`
- `STORE_URL_PRIVATE_IP_BLOCKED`
- `EMPRESA_CONTEXT_FORBIDDEN`
- `WEBHOOK_SIGNATURE_INVALID`
- `WEBHOOK_SIGNATURE_CHECK_FAILED`
- `WEBHOOK_PAYLOAD_TOO_LARGE`
- `WEBHOOK_RATE_LIMITED`
- `JOB_FAILED`
- `STORE_PAUSED_AUTH_FAILURE`
- `CLAIM_FAILED`

## Uso esperado

- Respostas administrativas (ex.: `stores.healthcheck`) retornam `error_code` e `hint`.
- Logs críticos gravam em `woocommerce_sync_log.meta`:
  - `code`
  - `hint`
- `stores.status` agrega os erros normalizados em `recent_errors`.

## Fonte de verdade no código

- `supabase/functions/_shared/woocommerceErrors.ts`
