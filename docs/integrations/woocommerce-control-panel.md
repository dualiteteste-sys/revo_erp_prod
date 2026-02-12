# Painel de Controle WooCommerce (Menu Desenvolvedor)

Rota base: `/app/desenvolvedor/woocommerce`

Objetivo: oferecer operação interna por store sem expor segredos, usando `stores.status` e ações do `woocommerce-admin`.

## Telas

1. **Lista de stores**
   - Exibe `base_url`, `status`, `auth_mode` e `store_id`.
   - Ação: abrir detalhe da loja.

2. **Detalhe da store**
   - Seções:
     - `Overview`
     - `Webhooks`
     - `Jobs / DLQ`
     - `Product Map`
     - `Sync Tools`
     - `Logs`

## Ações internas disponíveis

- `Replay order_id`: enfileira `stores.reconcile.orders`.
- `Run worker now`: executa `stores.worker.run`.
- `Reenfileirar job dead`: executa `stores.jobs.requeue` com `job_id`.
- `Rebuild map`: enfileira `stores.product_map.build`.
- `Force sync por SKU`:
  - estoque: `stores.sync.stock`
  - preço: `stores.sync.price`
- `Pause/Unpause store`:
  - pausa: `stores.pause`
  - reativa: `stores.unpause`
- `Testar conexão`: `stores.healthcheck`
- `Registrar webhooks`: `stores.webhooks.register`

## Segurança no painel

- Acesso restrito a `ops:manage` (mesmo padrão de acesso privilegiado do menu Desenvolvedor para ações sensíveis).
- O painel nunca mostra `consumer_key`, `consumer_secret`, webhook secret, tokens ou headers.
- Metadados exibidos em logs passam por redaction no frontend (`[REDACTED]` para chaves sensíveis).
- As chamadas para `woocommerce-admin` enviam `x-empresa-id` da empresa ativa.

## Uso rápido

1. Abra a store e valide `Overview` (`health`, `queue`, `webhooks`, `map_quality`).
2. Se houver erro 401/403 recorrente, pause a store até corrigir credenciais/proxy.
3. Para pedido perdido, use `Replay order_id`.
4. Para divergência de catálogo, rode `Rebuild map`.
5. Para correção pontual, rode `Force sync por SKU`.
6. Confirme resultado em `Jobs / DLQ` e `Logs`.
