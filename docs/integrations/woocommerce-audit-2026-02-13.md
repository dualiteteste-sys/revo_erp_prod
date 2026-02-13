# Auditoria Técnica WooCommerce (2026-02-13)

## Escopo
- Frontend de Configurações/Integrações (`MarketplaceIntegrationsPage`).
- Serviços de integração (`ecommerceIntegrations`, `woocommerceControlPanel`, `woocommerceCatalog`).
- Edge Functions Woo (`woocommerce-admin`, `woocommerce-webhook`, `woocommerce-worker`, `woocommerce-scheduler`, `woocommerce-test-connection`).
- Contrato operacional atual do repositório.

## Resultado executivo
- A base técnica já tem vários pilares de “estado da arte”: fila assíncrona, deduplicação de webhook, retry/backoff, classificação de erros e contrato de status.
- O maior risco atual não é “falta de feature”, e sim **arquitetura híbrida** (stack legado + stack nova) gerando inconsistência de fluxo.
- Corrigido neste lote: **Configurações agora expõe a opção “Integrações”** e abre o fluxo correto (`/app/configuracoes/ecommerce/marketplaces`), removendo o falso fallback para “Empresa”.

## O que está sólido hoje
- **Segurança de webhook:** validação de assinatura HMAC (`X-WC-Webhook-Signature`), rate limit e dedupe por entrega/hash.
- **Processamento confiável:** worker com retries, dead-letter e lock por tipo/store.
- **Observabilidade:** logs estruturados, contrato de status e códigos de erro com hint.
- **Multi-tenant:** proteção por `empresa_id` e validação de contexto em Edge Functions.

## Gaps críticos identificados
1. **Fluxo de conexão duplicado**
   - UI de Configurações usa `woocommerce-test-connection`.
   - Painel Woo operacional usa `woocommerce-admin` (`stores.healthcheck`/`stores.status`).
   - Impacto: dois caminhos de verdade para “status da conexão”.

2. **Modelo de dados híbrido**
   - Legado em `ecommerces` + `ecommerce_connection_secrets`.
   - Novo em `integrations_woocommerce_store` + tabelas `woocommerce_*`.
   - Impacto: manutenção cara e maior chance de divergência modal/card/status.

3. **UX de entrada em integrações**
   - Antes deste ajuste, rota de marketplaces não aparecia no menu de Configurações, dificultando acesso e diagnóstico.

## Correção aplicada neste PR
- Inclusão da aba/item **Integrações** no menu de Configurações.
- Mapeamento de conteúdo para renderizar `MarketplaceIntegrationsPage`.
- Compatibilidade de links legados via `?settings=integrations|marketplaces`.

## Plano recomendado (próximos lotes, sem big-bang)
1. **Unificar conexão Woo em um único backend**
   - Tornar `woocommerce-admin` a fonte única para `testConnection/status`.
   - Encerrar gradualmente `woocommerce-test-connection` após migração segura.

2. **Convergir modelo legado para store-centric**
   - Migrar UI de Configurações para operar em `integrations_woocommerce_store`.
   - Manter compatibilidade temporária com migração assistida e idempotente.

3. **Onboarding “1 minuto”**
   - Etapas explícitas: URL → CK/CS → Teste real → Registrar webhooks → Sync inicial.
   - Exibir checklist com status em tempo real (sem estado “ambíguo”).

4. **SLO operacional**
   - Indicadores mínimos: taxa de sucesso por job, tempo de fila, erros por código, último webhook válido.

## Matriz de risco (Preflight)
| Risco | Severidade | Mitigação | Teste obrigatório |
|---|---|---|---|
| Divergência de status entre fluxos Woo | Alta | unificar endpoint de conexão/status | integração: salvar+testar+reabrir modal |
| Regressão multi-tenant em funções públicas | Alta | manter guard por `empresa_id` + assinatura/chaves | QA com duas empresas simultâneas |
| Duplicidade de importação via webhook/replay | Média | dedupe key + idempotência de upsert | reenvio do mesmo webhook 2x |
| Queda de UX por fluxo disperso | Média | centralizar em Configurações > Integrações | smoke de navegação e conexão |

## Referências oficiais consultadas
- WooCommerce REST API docs: <https://woocommerce.github.io/woocommerce-rest-api-docs/>
- WooCommerce API Authentication: <https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication>
- WooCommerce REST API keys/permissions (UI): <https://woocommerce.com/document/woocommerce-rest-api/>
- WooCommerce Webhooks docs: <https://woocommerce.com/document/webhooks/>
- Webhook retries and auto-disable after failures: <https://developer.woocommerce.com/docs/best-practices/urls-and-routing/webhooks/>
