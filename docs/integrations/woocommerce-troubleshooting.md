# WooCommerce ↔ Revo ERP — Troubleshooting

## 401/403 ao chamar a API do Woo

Verifique:
- A loja está em HTTPS (recomendado para `basic_https`).
- A Consumer Key/Secret tem permissões de leitura/escrita conforme necessário.
- O servidor/proxy/WAF não está removendo o header `Authorization` (quando `auth_mode=basic_https`).
- Se `Authorization` for bloqueado, use `auth_mode=querystring_fallback` (somente server-side).
- Em `401/403`, a store pode ser marcada como `paused`; rode `stores.healthcheck` após corrigir credenciais.

## Webhook não dispara ou não processa

Checklist:
- `stores.webhooks.register` foi executado e o `delivery_url` está correto.
- A Edge Function `woocommerce-webhook` está acessível publicamente.
- A assinatura está válida:
  - Header `X-WC-Webhook-Signature` presente
  - Secret do webhook configurado na store
- Veja `stores.status` para inspecionar `woocommerce_webhook_event` e jobs enfileirados.

## 429 (rate limit) / 5xx intermitente no Woo

- Jobs são reprocessados automaticamente com backoff no `woocommerce-worker`.
- Se o erro persistir, pause a store (`status=paused`) até estabilizar.
- Garanta execução periódica do `woocommerce-scheduler` para drenar fila sem ação manual.

## SKU missing / SKU duplicado

- A sincronização por SKU depende de SKUs consistentes entre Revo e Woo.
- Rode `stores.product_map.build` e revise:
  - produtos sem SKU no Woo
  - SKUs duplicados (principalmente em variações)

## Divergências de estoque e preço

- Use `stores.sync.stock` / `stores.sync.price` com SKUs específicos para corrigir divergências pontuais.
- Recomenda-se rodar `stores.product_map.build` após mudanças grandes de catálogo.

## Credenciais “salvam”, mas a UI volta para “não armazenada”

Sintoma:
- Após clicar **Salvar credenciais**, aparece toast verde, mas em ~1s os sinalizadores voltam para:
  - “Consumer Key não armazenada”
  - “Consumer Secret não armazenada”

Causa raiz típica:
- O front salva via `ecommerce_woo_set_secrets_v2`, mas logo em seguida consulta `ecommerce_connection_diagnostics('woo')`.
- Se o banco estiver com uma versão antiga/bugada de `ecommerce_connection_diagnostics`, ela pode retornar `has_consumer_key/has_consumer_secret=false`,
  e o React interpreta isso como “não armazenado”.

Como validar (sem expor segredos):
- Confirme que a migration de correção foi aplicada e que a função usa `woo_consumer_key/woo_consumer_secret` como fonte de verdade.
- Migrations relevantes:
  - `supabase/migrations/20270215100000_fix_woo_diagnostics_credentials_visibility.sql`
  - `supabase/migrations/20270216190000_fix_woo_diagnostics_secrets_source_of_truth.sql`

Observação importante:
- Falha em **Testar conexão** (ex.: rate limit/546/timeout) não deve fazer `has_consumer_key/has_consumer_secret` virar `false`.
  Esses flags devem refletir apenas “secrets stored?” (estado no DB), enquanto `connection_status` reflete o resultado do teste.
