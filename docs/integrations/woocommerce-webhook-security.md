# WooCommerce Webhook Security

## Hardening aplicado

1. Raw body + assinatura
- O receiver usa body bruto (`arrayBuffer`) para calcular `HMAC SHA-256` base64.
- A comparacao usa timing-safe equal.

2. Dedupe robusto
- Preferencia: `X-WC-Webhook-Delivery-Id`.
- Fallback: `(store_id, topic, woo_resource_id, payload_hash)`.

3. Protecao de abuso
- Limite de tamanho (`WOOCOMMERCE_WEBHOOK_MAX_BYTES`, default `262144`).
- Rate limit por store (`WOOCOMMERCE_WEBHOOK_RATE_LIMIT_PER_MINUTE`, default `120`).
- Retencao/limpeza via RPC `woocommerce_webhook_event_cleanup`.
- Quando houver drop por size/rate:
  - registra `woocommerce_webhook_event.process_status = "dropped"` com `error_code`.
  - enfileira `ORDER_RECONCILE` com debounce de 5 minutos por store para recuperar eventos perdidos.

4. Seguranca de segredos
- `webhook_secret` fica criptografado em `integrations_woocommerce_store.webhook_secret_enc`.
- Segredos nunca aparecem no payload de log.

5. Resposta rapida
- Receiver responde `204` rapidamente.
- Processamento real ocorre via fila (`woocommerce_sync_job`).

## Recuperação pós-drop

- O worker aceita `ORDER_RECONCILE` sem `order_id` para reconciliar pedidos recentes.
- Esse caminho é usado automaticamente após `WEBHOOK_PAYLOAD_TOO_LARGE` ou `WEBHOOK_RATE_LIMITED`.

## Variaveis de ambiente

- `INTEGRATIONS_MASTER_KEY` (obrigatoria)
- `WOOCOMMERCE_WEBHOOK_MAX_BYTES` (opcional)
- `WOOCOMMERCE_WEBHOOK_RATE_LIMIT_PER_MINUTE` (opcional)
- `WOOCOMMERCE_WEBHOOK_RETENTION_DAYS` (opcional)
