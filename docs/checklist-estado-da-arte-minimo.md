# Checklist “Estado da Arte” (mínimo para bater de frente) — REVO ERP

Objetivo: fechar rapidamente o **mínimo competitivo** (com nível de excelência) para lançar e evoluir sem retrabalho.

Regras:
- **Sem gambiarra em PROD**: tudo via migrations/PR/pipeline.
- “Feito” = passou em **RG-01** (tests + e2e + verify migrations) e **RG-03** (console limpo) + smoke em PROD.
- Para cada item, manter evidência: print/registro do fluxo e link do PR.

## 0) Plataforma (obrigatório para todos os módulos)

### 0.1 UX padrão produto
- [ ] UX-01 Busca global + atalhos (Ctrl/Cmd+K) sem erros e com foco/teclado
- [ ] UX-02 Listas: filtros + ordenação + paginação eficiente + “estado vazio” com CTA
- [ ] UX-03 Colunas configuráveis + exportação CSV (mínimo) nas listas principais
- [ ] UX-04 Ações em massa (mínimo: excluir/ativar/inativar quando existir) nas listas principais
- [ ] UX-05 Formulários: validação forte + mensagens claras + máscaras BR (CNPJ/CPF/CEP/telefone)
- [ ] UX-06 Feedback consistente: loading/skeleton, sucesso, erro (sem alert), “tentar novamente”
- [ ] UX-07 Acessibilidade básica: navegação por teclado e foco visível nos modais

### 0.2 Confiabilidade e observabilidade
- [ ] OPS-01 Idempotência em ações críticas (emitir/cancelar, finalizar PDV, baixa/estorno financeiro, recebimento)
- [ ] OPS-02 Locks/anti-double-click e estados “em progresso” em botões críticos
- [ ] OPS-03 Auditoria por entidade (quem/quando/o que mudou) nos fluxos críticos
- [ ] OPS-04 Logs estruturados (mínimo: contexto + empresa_id + user_id + entity_id)
- [ ] OPS-05 Reprocessamento seguro de jobs/webhooks (fila + retry/backoff + dead-letter)
- [ ] OPS-06 Monitor “saúde” (mínimo: página/indicador de falhas recentes por integração)

### 0.3 Segurança (sem isso vira suporte infinito)
- [ ] SEC-01 RLS consistente nos dados por `empresa_id` (e `unidade_id` quando aplicável)
- [ ] SEC-02 Permissões por ação (ver/criar/editar/excluir) para os módulos do MVP
- [ ] SEC-03 “PlanGuard/assinatura” não pode bloquear o app por falso-positivo (fallback seguro)
- [x] SEC-04 Seed/dados de demo só em DEV (ou behind flag), nunca afetar PROD

### 0.4 Release gate (qualidade)
- [x] RG-01 Release Gate local/CI: `yarn test --run` + suite E2E + `yarn verify:migrations`
- [x] RG-02 Pipeline PROD: “expected vs PROD schema” sem divergências
- [x] RG-03 Console limpo: varredura de módulos críticos sem erros/warns relevantes
- [ ] RG-04 E2E “Happy path” por plano (Comércio/Serviços/Indústria) automatizado

## 1) Cadastros (base do ERP)
- [ ] CAD-01 Parceiros (clientes/fornecedores): CRUD + busca + validações (CPF/CNPJ) + endereços
- [ ] CAD-02 Produtos: CRUD + unidade + NCM/tributação básica + import/export CSV
- [ ] CAD-03 Serviços: CRUD + preço + impostos básicos (se aplicável)
- [ ] CAD-04 Transportadoras + embalagens + grupos/unidades: CRUD consistente

## 2) Suprimentos + Estoque (mínimo “redondo”)
- [ ] SUP-01 Estoque: saldo por produto + movimentações + ajuste manual auditável
- [ ] SUP-02 Compras (OC): criar/aprovar (simples) + itens + status + histórico
- [ ] SUP-03 Recebimentos: importar XML + conferência + vincular produtos + dar entrada no estoque
- [ ] SUP-04 Cancelar/estornar recebimento com reversão de estoque (quando permitido) + auditoria

## 3) Vendas (mínimo competitivo no lançamento)

### 3.1 Pedidos + precificação simples
- [ ] VEN-01 Pedido de venda: CRUD + itens + impostos básicos (se aplicável) + status
- [ ] VEN-02 Regras mínimas: desconto (com permissão), frete, arredondamentos e validações
- [ ] VEN-03 Reserva/baixa de estoque (mínimo: baixa ao faturar/finalizar)

### 3.2 PDV (1 caixa no plano básico)
- [ ] PDV-01 “Nova venda” rápido: cliente opcional, leitura por SKU, atalhos de teclado
- [ ] PDV-02 Finalizar: gera recebimento + baixa de estoque + comprovante (print/PDF simples)
- [ ] PDV-03 Estorno: reversão financeira + reversão estoque + auditoria

### 3.3 Expedição (fluxo completo no Pro)
- [ ] EXP-01 Separação/embalagem/envio/entrega com status e datas
- [ ] EXP-02 Vincular pedido + rastreio + observações + histórico

### 3.4 Comissões + metas + painel (Pro)
- [ ] COM-01 Comissões: regra simples por vendedor (% ou tabela) + relatório + export
- [ ] MET-01 Metas: CRUD + acompanhamento (atingido x meta) + alertas simples
- [ ] DASH-01 Painel de vendas: KPIs principais e filtros por período/canal/vendedor

### 3.5 CRM + automações (MVP “bem feito”, sem prometer demais)
- [ ] CRM-01 Funil: etapas configuráveis + cards + atividades/anotações
- [ ] CRM-02 Conversão: oportunidade → pedido (link consistente + rastreável)
- [ ] AUTO-01 Automações: CRUD + simulação/validação + execução assíncrona (fila)

## 4) Fiscal (NF-e)
- [ ] NFE-01 Config fiscal completa (emitente, série/numeração, ambiente, CSC se aplicável)
- [ ] NFE-02 Rascunho + validação local (motor fiscal v1) + preview do XML
- [ ] NFE-03 Emissão via provedor (NFE.io): enviar + consultar status + armazenar XML/DANFE + logs
- [ ] NFE-04 Webhooks: assinatura/HMAC + fila + retry idempotente + reprocessar manual
- [ ] NFE-05 Eventos: cancelamento + CCe (se aplicável) + inutilização + reimpressão DANFE
- [ ] NFE-06 Observabilidade fiscal: timeline por NF (eventos/tentativas/falhas) + payload saneado

## 5) Serviços (OS) + Financeiro (forte o suficiente para vender)

### 5.1 OS “estado da arte” (fluxo)
- [ ] OS-01 OS: criar + agenda/status + anexos + histórico + custos
- [ ] OS-02 Permissões por etapa (ex.: técnico vs gestor)
- [ ] OS-03 OS → Financeiro: gerar parcelas/contas a receber + estorno + auditoria
- [ ] OS-04 Relatórios de OS: período/status/cliente + faturamento

### 5.2 Financeiro essencial
- [ ] FIN-01 A Receber: criar/baixar/estornar/cancelar + conciliação mínima
- [ ] FIN-02 A Pagar: criar/baixar/estornar/cancelar
- [ ] FIN-03 Tesouraria: extrato bancário (import) + vincular lançamentos + saldo confiável
- [ ] FIN-04 Centros de custo (quando ativo): alocação simples + relatórios
- [ ] FIN-05 Relatórios essenciais: pagar/receber/caixa/faturamento por período

## 6) Indústria (mínimo para “pronto para vender”)
- [ ] IND-01 OP/OB wizard consistente + travas de estados + cancelados/readonly corretos
- [ ] IND-02 Execução: operações/apontamentos/entregas com permissões e consistência
- [ ] IND-03 Roteiros + BOM (produção/beneficiamento/ambos) persistência/seleção corretas
- [ ] IND-04 Suprimentos mínimo: recebimentos XML + conferência + vínculos + estoque ok (sem custo por enquanto)
- [ ] IND-05 Qualidade mínimo: planos/motivos/lotes/bloqueio com auditoria
- [ ] IND-06 Relatórios essenciais: WIP/filas/eficiência/estoque/qualidade

## 7) Go-live (sem onboarding avançado por enquanto)
- [ ] GL-02 Backup/restore + rotinas de suporte (exportações, trilha de auditoria)
- [ ] GL-03 Hardening final (permissões, RLS, RPCs, rate limits, erros amigáveis)

## Ordem recomendada (para velocidade com excelência)
1) 0) Plataforma (RG-01/02/03/04 + SEC + OPS) — reduz retrabalho
2) Cadastros + Estoque/Recebimentos — base para vendas/OS/indústria
3) Vendas mínimo (Pedidos + PDV + Expedição) — “valor imediato”
4) Fiscal NF-e (config + emissão + webhooks + observabilidade) — “onde mais quebra”
5) Serviços + Financeiro (OS→Financeiro + extrato) — “retém cliente”
6) Indústria (IND-01..06) — “plano estrela”
