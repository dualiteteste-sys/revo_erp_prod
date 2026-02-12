# WooCommerce Health Checks (Monitor de Saúde)

Os checks Woo agora aparecem no Monitor de Saúde (`/app/desenvolvedor/saude`) com severidade, mensagem humana, próxima ação e link direto para o painel da store.

## Checks implementados

1. `WORKER_LAG`
   - Avalia backlog/erros/dead-letter da fila.
2. `WEBHOOK_STALE`
   - Detecta atraso/ausência de webhooks recentes em store ativa.
3. `AUTH_FAILING`
   - Identifica falhas de autenticação/autorização (401/403) e store pausada por credencial.
4. `ERROR_RATE`
   - Mede taxa de jobs em erro/dead na janela de jobs recentes.
5. `MAP_CONFLICTS`
   - Detecta SKU duplicado e SKU sem vínculo no product map.
6. `ORDER_IMPORT_STALE`
   - Detecta estagnação no import de pedidos.

## Severidade

- `critical`: impacto alto e ação imediata.
- `warning`: risco crescente; tratar no mesmo ciclo.
- `info`: estado saudável/observável, sem ação imediata.

## Campos exibidos por check

- `severity`
- `message` (humana e objetiva)
- `next_action` (ação sugerida)
- `panel_link` (rota do painel da store: `/app/desenvolvedor/woocommerce/:storeId`)

## Operação recomendada

1. Priorize `critical`.
2. Trate `AUTH_FAILING` antes de replay/sync.
3. Para `MAP_CONFLICTS`, resolva SKU e rode `Rebuild map`.
4. Para `WORKER_LAG`/`ORDER_IMPORT_STALE`, execute `Run worker now` e reavalie DLQ.

## Thresholds configuráveis (frontend)

Os checks usam defaults seguros e podem ser ajustados por env (`import.meta.env`):

- `VITE_WOO_WORKER_ERROR_CRITICAL` (default: `5`)
- `VITE_WOO_WORKER_QUEUED_WARNING` (default: `10`)
- `VITE_WOO_WEBHOOK_STALE_WARN_MIN` (default: `60`)
- `VITE_WOO_WEBHOOK_STALE_CRITICAL_MIN` (default: `180`)
- `VITE_WOO_ERROR_RATE_WARN_MIN_JOBS` (default: `2`)
- `VITE_WOO_ERROR_RATE_WARN_RATIO` (default: `0.2`)
- `VITE_WOO_ERROR_RATE_CRITICAL_MIN_JOBS` (default: `3`)
- `VITE_WOO_ERROR_RATE_CRITICAL_RATIO` (default: `0.5`)
- `VITE_WOO_ORDER_IMPORT_STALE_WARN_MIN` (default: `120`)
- `VITE_WOO_ORDER_IMPORT_STALE_CRITICAL_MIN` (default: `360`)
