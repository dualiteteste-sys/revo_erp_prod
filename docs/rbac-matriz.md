# Matriz RBAC (domínios × ações)

Este documento é a fonte de verdade para **permissões** no Revo.

- **Domínio (`module`)**: “área” do sistema (ex.: `vendas`, `suprimentos`, `industria`).
- **Ação (`action`)**: o que o usuário pode fazer.

## Ações

- `view`: acessar, listar, visualizar detalhes
- `create`: criar
- `update`: editar, mudar status, aprovar/concluir
- `delete`: excluir/estornar/cancelar (quando for “remoção lógica”, continua sendo `delete`)
- `manage`: configurações avançadas, reprocessamentos, mudanças de alto impacto
- `export`: exportar dados (CSV/Excel/integrações de extração)

## Domínios (principais)

**Cadastros**
- `partners`: clientes/fornecedores
- `produtos`: produtos, imagens, grupos/unidades/embalagens
- `vendedores`: vendedores
- `logistica`: transportadoras, expedição, logística leve

**Comércio**
- `vendas`: pedidos, PDV, devoluções, comissões, dashboards
- `metas`: metas de vendas (quando separado)
- `crm`: pipeline, oportunidades, atividades

**Suprimentos**
- `suprimentos`: estoque, compras, recebimentos, importação XML

**Serviços**
- `servicos`: contratos, notas, cobranças
- `os`: ordem de serviço
- `relatorios_servicos`: relatórios de serviços/OS

**Financeiro**
- `tesouraria`: contas correntes, movimentações, extrato bancário
- `contas_a_receber`: contas a receber
- `contas_a_pagar`: contas a pagar
- `centros_de_custo`: centros de custo
- `relatorios_financeiro`: relatórios financeiros

**Fiscal**
- `fiscal`: NF-e (rascunho/emissão) + configurações

**Indústria**
- `industria`: BOM/roteiros/OP-OB/execução/operadores/automação
- `mrp`: PCP, MRP, capacidade/APS
- `qualidade`: planos, motivos, lotes/bloqueio, inspeções

**Plataforma/Operação**
- `usuarios`: usuários (convites, desativar, reativar)
- `roles`: papéis/perfis
- `rh`: módulo RH
- `logs`: Developer → Logs (visualização) e telemetria (registro)
- `ops`: monitor de saúde, reprocessamento de jobs/webhooks
- `ecommerce`: integrações (Mercado Livre, Shopee, etc.)

## Regra de ouro (enforcement em 3 camadas)

1) **Menu**: esconde/desabilita o que não tem permissão  
2) **Rotas**: `RequirePermission` bloqueia navegação  
3) **Banco**: RLS + RPC guard (`require_permission_for_current_user`) impede bypass via console

