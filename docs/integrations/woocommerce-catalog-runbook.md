# WooCommerce Catalog — Runbook Operacional

## Leitura rápida

Quando um run de catálogo falhar:

1. Abrir `/app/products/woocommerce/runs/:runId`
2. Ver `error_code` e `hint` por item
3. Corrigir causa
4. Clicar em **Reexecutar falhas**

## Códigos de erro comuns

### `WOO_PREVIEW_BLOCKED`
- **Causa:** item sem SKU, sem vínculo mínimo ou inválido no preview.
- **Ação:** ajustar SKU/mapeamento e rodar preview novamente.

### `WOO_MAPPING_MISSING`
- **Causa:** produto Revo não encontrado por SKU ou map ausente.
- **Ação:** vincular por SKU na aba do produto ou rebuild do map no painel dev.

### `WOO_AUTH_INVALID` / `WOO_AUTH_FORBIDDEN`
- **Causa:** credencial inválida ou bloqueio por proxy/WAF.
- **Ação:** validar CK/CS e políticas de proxy; store pode ser pausada automaticamente.

### `WOO_RATE_LIMIT`
- **Causa:** limite de requests no Woo.
- **Ação:** aguardar retry/backoff automático; reduzir lotes simultâneos.

### `WOO_RESOURCE_NOT_FOUND`
- **Causa:** produto/variação Woo não existe mais.
- **Ação:** rebuild de map e exportar novamente.

### `WOO_REMOTE_UNAVAILABLE`
- **Causa:** instabilidade remota (5xx).
- **Ação:** retry automático; se persistir, validar host Woo.

## Checklist de suporte

- Store correta selecionada?
- SKU único por loja?
- Produto possui dados mínimos (`nome`, `sku`, preço)?
- Existe conflito de map (`duplicated_skus`) no status?
- Run ficou `partial` com itens recuperáveis via retry?

## Evidências para ticket interno

- `run_id`
- `store_id`
- `error_code` principal
- 2–3 SKUs de exemplo
- timestamp aproximado do incidente

