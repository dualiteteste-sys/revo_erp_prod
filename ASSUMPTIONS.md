# Assumptions / TODOs — WooCommerce ↔ Revo ERP

Este PR implementa a integração WooCommerce ↔ Revo ERP usando Supabase (DB + Edge Functions) e o domínio existente de vendas/produtos do Revo.

## Assumptions (o que eu assumi para integrar sem perguntar)

1) **Tabelas do Revo usadas para persistência de pedidos**
- `public.vendas_pedidos` (cabeçalho) com colunas minimamente compatíveis:
  - `id` (uuid)
  - `empresa_id` (uuid)
  - `cliente_id` (uuid)
  - `data_emissao` (date/text YYYY-MM-DD)
  - `status` (text)
  - `frete`, `desconto`, `total_produtos`, `total_geral` (numéricos)
  - `canal` (text)
  - `observacoes` (text)
- `public.vendas_itens_pedido` (itens) com:
  - `empresa_id`, `pedido_id`, `produto_id`
  - `quantidade`, `preco_unitario`, `desconto`, `total`

2) **Cadastro de cliente**
- Existe tabela `public.pessoas` com:
  - `empresa_id`, `tipo`, `nome`, `email`, `telefone`, `codigo_externo`, `deleted_at`
- A integração cria “snapshot de cliente” como registro em `pessoas` (idempotente via `codigo_externo`).

3) **Produtos e SKU**
- Existe tabela `public.produtos` com:
  - `id` (uuid), `empresa_id` (uuid), `sku` (text)
  - `estoque_atual` (numérico) e `preco_venda` (numérico)
  - `deleted_at` (nullable)
- **SKU** é tratado como chave de matching entre Revo e Woo.

4) **Worker**
- O `woocommerce-worker` é invocado por HTTP com header `x-woocommerce-worker-key`.
- Este PR não cria cron automático; recomenda-se configurar um schedule externo/Supabase cron para processar jobs periodicamente.

## TODOs (fáceis de evoluir)

- Implementar `auth_mode=oauth1` (hoje cai em Basic como fallback).
- Melhorar reconciliação incremental (ORDER_RECONCILE com `since` paginado).
- Adicionar relatório formal de conflitos de SKU (duplicados/missing) no `/status`.
- Debounce automático ao detectar alterações de estoque/preço (hook nos pontos de escrita do ERP).

