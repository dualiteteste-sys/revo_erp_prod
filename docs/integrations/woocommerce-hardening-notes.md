# WooCommerce Hardening Notes (Fase 1)

Escopo implementado nesta fase sem quebrar contratos existentes:

1. Anti-spoof multi-tenant
- `woocommerce-admin` valida `x-empresa-id` contra memberships reais do JWT (`empresa_usuarios`).
- **Modo estrito**: se `x-empresa-id` vier no request e o usuário JWT não for membro da empresa, retorna `403 EMPRESA_CONTEXT_FORBIDDEN` sem fallback.
- Todas as operacoes por `store_id` continuam filtrando `empresa_id`.

2. SSRF e canonicalizacao
- `base_url` agora exige `https`.
- Bloqueio de `localhost`, sufixos privados (`.local`, `.internal`) e IPs privados/reservados.
- URL canonicalizada sem query/hash e sem credenciais embutidas.

3. Worker e fila robustos
- Claim de jobs considera `queued + error + running stale`.
- Lock logico por `(store_id, type)` para evitar corrida no mesmo tipo de sincronizacao por loja.
- Classificacao de erro Woo com codigos estaveis e hints para suporte.
- Falhas `401/403` pausam a store e colocam jobs pendentes em espera com erro explicito.

4. Scheduler autonomo
- Nova Edge Function `woocommerce-scheduler` para acionar o worker em lotes.
- `woocommerce-worker` suporta modo `scheduler=true` para drenar a fila por batches.
- Scheduler com autenticação por chave (`x-woocommerce-scheduler-key`) e distinção de erro:
  - ausente => `401 SCHEDULER_UNAUTHENTICATED`
  - inválida => `403 SCHEDULER_FORBIDDEN`

5. Retencao e protecao de webhook
- Limite de tamanho do payload.
- Rate limit por loja (janela de 1 minuto).
- Cleanup de eventos antigos via RPC `woocommerce_webhook_event_cleanup`.
