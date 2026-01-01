# Checklist “Estado da Arte” — Integrações com Marketplaces (Shopee + Mercado Livre)

Objetivo: deixar as integrações **prontas para uso real**, com **idempotência, rastreabilidade e UX simples**, sem virar “consultoria disfarçada”.

Princípios:
- “Feito” = passou **RG-01/RG-03** + smoke em PROD (após merge no `main` por PR).
- **Sem writes manuais em PROD**: tudo via migrations/PR/pipeline.
- **Arquitetura em 2 camadas**:
  - **Camada Revo (padrão)**: modelo canônico + fila + logs + idempotência + UI.
  - **Adaptadores por canal**: Shopee / Mercado Livre (diferenças de OAuth, catálogo, status, limites e webhooks).

## 0) Base (plataforma de integração)

### 0.1 Conexões e segurança
- [x] INT-01 Modelo canônico: `connections` + `accounts` + `mappings` (externo ↔ interno) com `empresa_id`
- [ ] INT-02 Credenciais seguras: secrets no provedor (Supabase/Actions) + tokens no DB apenas criptografados/rotacionáveis (quando aplicável)
- [ ] INT-03 OAuth “redondo”: connect → refresh token → revoke/disconnect + auditoria
- [x] INT-04 RLS + RBAC: só admins gerenciam integrações; dados sempre filtrados por `empresa_id`

### 0.2 Execução assíncrona, idempotência e resilência
- [x] INT-05 Fila de jobs: `jobs` + `runs` + `dead_letter` (reprocessar manual com segurança)
- [x] INT-06 Idempotência por entidade: pedido/listing/shipment/stock (dedupe por `provider` + `external_id`)
- [ ] INT-07 Retry/backoff + rate limit: respeitar limites do canal (throttling) e evitar “ban”
- [ ] INT-08 Locks anti-concorrência: evitar processar a mesma ordem duas vezes (row lock + lease)

### 0.3 Observabilidade “estado da arte”
- [x] INT-09 Logs estruturados: `integration_logs` com `empresa_id`, `provider`, `entity_type`, `entity_id`, `run_id`
- [ ] INT-10 Timeline por pedido/listing: eventos (importado, aprovado, enviado, entregue, erro, retry)
- [x] INT-11 Monitor “saúde”: falhas recentes por canal + fila pendente + último sync ok/erro

### 0.4 UX (Centro de Integrações)
- [x] INT-12 Página “Integrações”: cards por canal (status, conectado, último sync, falhas)
- [x] INT-13 Conectar em 1 minuto: wizard com ajuda + botão “Testar conexão”
- [x] INT-14 “Modo seguro” (MVP): toggles por recurso (importar pedidos / atualizar status / sync estoque)

## 1) Mercado Livre (MELI)

### 1.1 Conexão
- [x] MELI-01 OAuth connect + callback + armazenamento de tokens (refresh automático)
- [ ] MELI-02 Seleção de conta (seller) + vínculo a `empresa_id`

### 1.2 Pedidos (MVP prioritário)
- [x] MELI-03 Importar pedidos por janela (since) + paginação + dedupe (external order id)
- [x] MELI-04 Mapear pedido → `vendas_pedidos` (cliente, itens, frete, impostos básicos, canal=marketplace)
- [ ] MELI-05 Estados: refletir “aprovado/pago/cancelado” no Revo sem quebrar regras internas

### 1.3 Envios (Expedição)
- [ ] MELI-06 Criar/atualizar expedição no Revo (status + tracking) a partir do shipping do MELI
- [ ] MELI-07 Atualizar tracking/status no MELI quando expedição avançar (quando permitido)

### 1.4 Estoque (mínimo)
- [ ] MELI-08 Sync estoque por SKU (saldo disponível) com throttling + fila
- [ ] MELI-09 Regras de estoque: “não zerar por bug” (guardrails: mínimo/limite, dry-run, logs)

### 1.5 Webhooks
- [ ] MELI-10 Webhooks: assinatura/verificação + persistir evento + enfileirar job idempotente

## 2) Shopee

### 2.1 Conexão
- [x] SHO-01 OAuth/connect (conforme API Shopee) + callback + refresh/revoke
- [ ] SHO-02 Vínculo loja/canal + `empresa_id`

### 2.2 Pedidos (MVP prioritário)
- [ ] SHO-03 Importar pedidos (since) + paginação + dedupe
- [ ] SHO-04 Mapear pedido → `vendas_pedidos` (cliente, itens, frete, canal=marketplace)
- [ ] SHO-05 Estados: pago/cancelado/entregue com transições válidas no Revo

### 2.3 Envios (Expedição)
- [ ] SHO-06 Sincronizar tracking/status de envio (entrada e saída) com logs

### 2.4 Estoque (mínimo)
- [ ] SHO-07 Sync estoque por SKU com throttling + fila + guardrails

### 2.5 Webhooks
- [ ] SHO-08 Webhooks: assinatura + persistência + fila idempotente

## 3) Catálogo (opcional no MVP, mas necessário “pronto para uso”)
- [ ] CAT-01 Mapeamento SKU/variação: produto Revo ↔ anúncio/variante do canal
- [ ] CAT-02 Conflitos: detectar duplicados e sugerir merge (sem sobrescrever “na marra”)
- [ ] CAT-03 Sync preços (somente se habilitado) com auditoria e “modo simulação”

## 4) Financeiro/Conciliação (fase 2, mas com trilha mínima)
- [ ] PAY-01 Taxas/comissões por canal: registrar no pedido (metadados) para relatório básico
- [ ] PAY-02 Relatório simples por canal: vendas brutas, taxas, líquido (por período)

## 5) Qualidade (release gate específico de integração)
- [ ] QA-01 Testes de contrato (mock): mapear payload → modelo canônico (MELI/SHO)
- [ ] QA-02 E2E “happy path”: importar 1 pedido → gerar expedição → atualizar status → logs ok
- [ ] QA-03 E2E “erro controlado”: rate limit/timeout → retry → dead-letter → reprocessar manual

## Ordem recomendada (para sair usando rápido e sem sustos)
1) INT-01..INT-11 (base: fila/idempotência/logs/saúde)
2) MELI-01..MELI-05 + SHO-01..SHO-05 (importação de pedidos)
3) MELI-06..MELI-07 + SHO-06 (expedição/tracking)
4) MELI-08..MELI-09 + SHO-07 (estoque)
5) Webhooks (MELI-10, SHO-08) + QA-01..QA-03
6) CAT-* e PAY-* (evolução)
