# WooCommerce Catalog (Produtos)

## Objetivo

Entregar operação de catálogo WooCommerce no fluxo diário de Produtos com preview obrigatório e execução rastreável (`run_id`).

## Fluxos disponíveis no módulo de Produtos

1. **Exportar selecionados (Revo → Woo)**
2. **Sincronizar preço selecionados (Revo → Woo)**
3. **Sincronizar estoque selecionados (Revo → Woo)**
4. **Importar catálogo Woo (Woo → Revo)**

Todos os fluxos geram uma execução rastreável em `/app/products/woocommerce/runs/:runId`.

## UX implementada

- Coluna `Woo` no grid de produtos com status: `Vinculado`, `Não vinculado`, `Conflito`, `Erro`.
- Ações em massa no grid (barra de seleção) com wizard:
  - Opções
  - Validação + Preview
  - Execução
- Aba **Canais / WooCommerce** no formulário do produto:
  - status de vínculo
  - vínculo por SKU
  - desvincular
  - sync preço/estoque do item
- Tela dedicada de importação:
  - `/app/products/woocommerce/catalog?store=<store_id>`

## Ações backend adicionadas

- `stores.products.search`
- `stores.catalog.preview.export`
- `stores.catalog.run.export`
- `stores.catalog.preview.sync_price`
- `stores.catalog.run.sync_price`
- `stores.catalog.preview.sync_stock`
- `stores.catalog.run.sync_stock`
- `stores.catalog.preview.import`
- `stores.catalog.run.import`
- `stores.runs.get`
- `stores.runs.list`
- `stores.runs.retry_failed`
- `stores.listings.by_products`
- `stores.listings.by_product`
- `stores.listings.link_by_sku`
- `stores.listings.unlink`

## Modelo de execução (runs)

- `woocommerce_sync_run`: cabeçalho da execução.
- `woocommerce_sync_run_item`: itens da execução por SKU/produto.
- `woocommerce_listing`: shape amigável para UX do vínculo por produto.
- `woocommerce_sync_job` foi estendida com `run_id` e `run_item_id`.

## Endpoints Woo usados

Base: `${base_url}/wp-json/wc/v3`

- `GET /products`
- `GET /products/{id}`
- `POST /products`
- `PUT /products/{id}`
- `POST /products/batch`
- `POST /products/{product_id}/variations/batch`

## Observabilidade

- Execuções aparecem em `stores.status.recent_runs` (campo adicional compatível).
- Erros por item ficam em `woocommerce_sync_run_item` com `error_code` e `hint`.
- Worker mantém logs em `woocommerce_sync_log`.

## Processamento (worker/scheduler)

- Em **produção/dev online**, a fila é drenada automaticamente pelo scheduler.
- Em **ambiente local**, se a execução ficar em `queued`, use:
  - o botão **“Processar”** na tela `/app/products/woocommerce/runs/:runId`, ou
  - o painel de desenvolvedor de WooCommerce (quando disponível).
