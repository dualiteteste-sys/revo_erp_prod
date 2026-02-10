# Preflight — PR3 Woo Worker Import Orders

| Risco | Severidade | Mitigação no código | Teste obrigatório | Evidência |
|---|---|---|---|---|
| Importação Woo enfileira e nunca processa | Alta | Worker Woo no `marketplaces-sync` consumindo `ecommerce_import_jobs_claim` e marcando `done/error` | Fluxo manual: enfileirar + processar job | Retorno `processed_jobs/imported` + status de job atualizado |
| Pedido Woo criar dados inconsistentes no ERP | Alta | Upsert determinístico por `ecommerce_order_links`; recálculo de totais; atualização de status controlada | Teste integração com pedido novo e reimportação | `vendas_pedidos`/`vendas_itens_pedido` e link com mesmo `external_order_id` |
| Itens sem mapeamento sumirem sem rastreabilidade | Média | Persistência em `ecommerce_job_items` com `skipped/failed` e contexto | Importar pedido com SKU ausente | Itens aparecem no detalhe do job |
| Credencial Woo ausente gerar falso-positivo | Alta | Bloqueio explícito com erro `MISSING_WOO_CREDENTIALS`/`MISSING_STORE_URL` | Chamar worker sem CK/CS/store URL | Resposta 409 e job não avançado |
| Regressão no fluxo Meli existente | Alta | Branch condicional por provider; caminho Meli preservado | Rodar testes do serviço + `tsc` | Build e testes verdes |

