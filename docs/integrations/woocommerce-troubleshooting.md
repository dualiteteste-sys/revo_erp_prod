# WooCommerce ↔ Revo ERP — Troubleshooting

## 401/403 ao chamar a API do Woo

Verifique:
- A loja está em HTTPS (recomendado para `basic_https`).
- A Consumer Key/Secret tem permissões de leitura/escrita conforme necessário.
- O servidor/proxy/WAF não está removendo o header `Authorization` (quando `auth_mode=basic_https`).
- Se `Authorization` for bloqueado, use `auth_mode=querystring_fallback` (somente server-side).

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

## SKU missing / SKU duplicado

- A sincronização por SKU depende de SKUs consistentes entre Revo e Woo.
- Rode `stores.product_map.build` e revise:
  - produtos sem SKU no Woo
  - SKUs duplicados (principalmente em variações)

## Divergências de estoque e preço

- Use `stores.sync.stock` / `stores.sync.price` com SKUs específicos para corrigir divergências pontuais.
- Recomenda-se rodar `stores.product_map.build` após mudanças grandes de catálogo.

