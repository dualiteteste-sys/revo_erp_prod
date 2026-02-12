# Integração WooCommerce ↔ Revo ERP (multi-tenant)

Este documento descreve a integração WooCommerce ↔ Revo ERP com foco em:
- Segurança (segredos apenas no backend; criptografia at-rest)
- Multi-tenant (isolamento por `empresa_id` e `store_id`)
- Idempotência (webhooks deduplicados; import por upsert/merge)
- Resiliência (fila DB-backed + retry/backoff + dead-letter)

## Visão geral (componentes)

- **Banco (Supabase)**: tabelas e RPCs no migration `supabase/migrations/20270212180000_woocommerce_state_of_art_integration.sql`.
- **Edge Functions**:
  - `woocommerce-admin`: onboarding/healthcheck/register webhooks/build map/enqueue sync/status
  - `woocommerce-webhook`: receiver público (verify_jwt=false) para eventos de pedido
  - `woocommerce-worker`: worker (verify_jwt=false) com `x-woocommerce-worker-key` (processa jobs)
  - `woocommerce-scheduler`: scheduler para drenar fila em batches (verify_jwt=false)

## Segredos e variáveis de ambiente

Obrigatórias (Supabase Edge Functions):
- `INTEGRATIONS_MASTER_KEY`: chave mestra para criptografia AES-GCM (não versionar; definir como secret).
- `WOOCOMMERCE_WORKER_KEY`: chave para invocar o worker com segurança (não versionar).
- `WOOCOMMERCE_SCHEDULER_KEY`: chave para invocar scheduler (se ausente, usa `WOOCOMMERCE_WORKER_KEY`).
- `WOOCOMMERCE_WEBHOOK_MAX_BYTES`: limite de tamanho do webhook (default 262144).
- `WOOCOMMERCE_WEBHOOK_RATE_LIMIT_PER_MINUTE`: limite por loja/minuto (default 120).
- `WOOCOMMERCE_WEBHOOK_RETENTION_DAYS`: retenção de payloads de webhook (default 14 dias).

## Anti-spoof estrito (tenant)

- Se `x-empresa-id` for enviado e o usuário JWT não pertencer à empresa, o admin retorna:
  - `403`
  - `error = EMPRESA_CONTEXT_FORBIDDEN`
  - sem fallback para empresa ativa.

## Onboarding (store)

### 1) Criar store

Chame a Edge Function `woocommerce-admin` com JWT do usuário e header `x-empresa-id`:

```json
{
  "action": "stores.create",
  "base_url": "https://minhaloja.com.br",
  "auth_mode": "basic_https",
  "consumer_key": "ck_...",
  "consumer_secret": "cs_..."
}
```

Resposta inclui `store.id` (UUID). Esse `store_id` identifica a loja e deve ser usado em webhooks e jobs.

### 2) Healthcheck

```json
{ "action": "stores.healthcheck", "store_id": "<uuid>" }
```

### 3) Registrar webhooks no Woo (recomendado)

Cria webhooks `order.created` e `order.updated` no Woo apontando para:
`{SUPABASE_URL}/functions/v1/woocommerce-webhook/{store_id}`

```json
{ "action": "stores.webhooks.register", "store_id": "<uuid>" }
```

## Product map (SKU ↔ IDs)

Para construir o map inicial (produtos simples + variações):

```json
{ "action": "stores.product_map.build", "store_id": "<uuid>" }
```

O build é enfileirado como job `CATALOG_RECONCILE` e (se `WOOCOMMERCE_WORKER_KEY` estiver configurada)
o `woocommerce-admin` tenta executar uma passada do worker para dar feedback rápido.

## Importação de pedidos (Woo → Revo)

### Fluxo por webhook (preferencial)

1) Woo chama `woocommerce-webhook/{store_id}` com payload do pedido.
2) Evento é gravado em `public.woocommerce_webhook_event` com dedupe.
3) Um job `ORDER_RECONCILE` é enfileirado com `order_id`.
4) Worker busca o pedido completo no Woo (`GET /orders/{id}`) e faz upsert no Revo.

### Reprocessamento manual de um pedido

```json
{ "action": "stores.reconcile.orders", "store_id": "<uuid>", "order_id": 12345 }
```

## Sincronização de estoque e preços (Revo → Woo)

### Forçar sync por SKUs

Estoque:
```json
{ "action": "stores.sync.stock", "store_id": "<uuid>", "skus": ["SKU-001", "SKU-002"] }
```

Preços:
```json
{ "action": "stores.sync.price", "store_id": "<uuid>", "skus": ["SKU-001"] }
```

## Status / Observabilidade

```json
{ "action": "stores.status", "store_id": "<uuid>" }
```

Retorna:
- últimos webhooks (process_status, erro)
- últimos jobs (status, attempts, next_run_at)
- últimos logs estruturados (`woocommerce_sync_log`)
- `health` (queue lag, contadores, frescor de webhook)
- `map_quality` (missing map e duplicidade de SKU)
- `recommendations` (hints acionáveis)

## Scheduler (autônomo)

Dispare:

`POST {SUPABASE_URL}/functions/v1/woocommerce-scheduler`

Headers:
- `x-woocommerce-scheduler-key: <WOOCOMMERCE_SCHEDULER_KEY>`

Body exemplo:
```json
{ "limit": 10, "max_batches": 25 }
```

Isso aciona o `woocommerce-worker` em modo `scheduler=true`, permitindo drenar fila sem depender do `stores.*`.

Agendamento real no GitHub Actions:
- workflow `.github/workflows/woocommerce-scheduler.yml`
- cron `*/5 * * * *`
- concurrency habilitada para evitar sobreposição.

## Docs relacionadas

- `docs/integrations/woocommerce-hardening-notes.md`
- `docs/integrations/woocommerce-retry-policy.md`
- `docs/integrations/woocommerce-webhook-security.md`
- `docs/integrations/woocommerce-status-contract.md`
- `docs/integrations/woocommerce-status-examples.md`
- `docs/integrations/woocommerce-error-codes.md`
- `docs/integrations/woocommerce-control-panel.md`
- `docs/integrations/woocommerce-health-checks.md`
- `docs/integrations/woocommerce-scheduler.md`

## Notas de segurança

- **Nunca** exponha CK/CS no front-end. O front apenas envia as credenciais ao backend durante o onboarding.
- O sistema **não** loga segredos; payloads são sanitizados.
- Webhook valida assinatura (HMAC SHA-256 base64) usando secret criptografado por store.
