import type { SupabaseClient } from '@supabase/supabase-js';

import type { RoadmapGroup } from './types';

async function safeRpcCount(supabase: SupabaseClient, fn: string, args: Record<string, any>): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc(fn as any, args as any);
    if (error) return null;
    if (typeof data === 'number') return data;
    if (typeof data === 'string' && data.trim() && Number.isFinite(Number(data))) return Number(data);
    return null;
  } catch {
    return null;
  }
}

async function safeRpcList<T>(supabase: SupabaseClient, fn: string, args: Record<string, any>): Promise<T[] | null> {
  try {
    const { data, error } = await supabase.rpc(fn as any, args as any);
    if (error) return null;
    return Array.isArray(data) ? (data as T[]) : null;
  } catch {
    return null;
  }
}

async function safeRpcValue<T>(supabase: SupabaseClient, fn: string, args: Record<string, any> = {}): Promise<T | null> {
  try {
    const { data, error } = await supabase.rpc(fn as any, args as any);
    if (error) return null;
    return (data as T) ?? null;
  } catch {
    return null;
  }
}

async function safeTableHasAny(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, any> = {}
): Promise<boolean | null> {
  try {
    let query = supabase.from(table as any).select('id').limit(1);
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key as any, value as any);
    }
    const { data, error } = await query;
    if (error) return null;
    return (data?.length ?? 0) > 0;
  } catch {
    return null;
  }
}

function requireKnown<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

export function getRoadmaps(): RoadmapGroup[] {
  return [
    {
      key: 'cadastros',
      title: 'Cadastros',
      subtitle: 'Base do ERP: clientes, produtos, serviços e transportadoras.',
      steps: [
        {
          key: 'cadastros.clientes',
          title: 'Cadastre 1 Cliente',
          description: 'Crie um cliente para permitir pedidos, OS e financeiro.',
          actionLabel: 'Abrir Clientes e Fornecedores',
          actionHref: '/app/partners',
          check: async (supabase) => {
            const count = await safeRpcCount(supabase, 'count_partners_v2', { p_search: null, p_tipo: 'cliente', p_status: 'active' });
            return requireKnown(count, 'Não foi possível validar clientes agora.') > 0;
          },
        },
        {
          key: 'cadastros.produtos',
          title: 'Cadastre 1 Produto',
          description: 'Crie um produto ativo para vender em pedidos e PDV.',
          actionLabel: 'Abrir Produtos',
          actionHref: '/app/products',
          check: async (supabase) => {
            const count = await safeRpcCount(supabase, 'produtos_count_for_current_user', { p_q: null, p_status: null });
            return requireKnown(count, 'Não foi possível validar produtos agora.') > 0;
          },
        },
        {
          key: 'cadastros.servicos',
          title: 'Cadastre 1 Serviço',
          description: 'Crie um serviço com preço e status ativo para usar em OS e notas.',
          actionLabel: 'Abrir Serviços',
          actionHref: '/app/services',
          check: async (supabase) => {
            const count = await safeRpcCount(supabase, 'count_services_for_current_user', { p_search: null, p_status: 'ativo' });
            if (count !== null) return count > 0;
            const rows = await safeRpcList<any>(supabase, 'list_services_for_current_user_v2', {
              p_offset: 0,
              p_limit: 1,
              p_search: null,
              p_status: 'ativo',
              p_order_by: 'descricao',
              p_order_dir: 'asc',
            });
            return requireKnown(rows, 'Não foi possível validar serviços agora.').length > 0;
          },
        },
        {
          key: 'cadastros.transportadoras',
          title: 'Cadastre 1 Transportadora',
          description: 'Configure uma transportadora para expedição e fretes.',
          actionLabel: 'Abrir Transportadoras',
          actionHref: '/app/carriers',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'logistica_transportadoras_list', {
              p_search: null,
              p_ativo: true,
              p_limit: 1,
              p_offset: 0,
            });
            return requireKnown(rows, 'Não foi possível validar transportadoras agora.').length > 0;
          },
        },
      ],
    },
    {
      key: 'vendas',
      title: 'Vendas',
      subtitle: 'Pedidos → PDV → expedição, com velocidade e consistência.',
      steps: [
        {
          key: 'vendas.pedidos',
          title: 'Crie o 1º Pedido de Venda',
          description: 'Monte um pedido com itens e veja o fluxo completo até o financeiro.',
          actionLabel: 'Abrir Pedidos de Vendas',
          actionHref: '/app/vendas/pedidos',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'vendas_list_pedidos', { p_search: null, p_status: null });
            return requireKnown(rows, 'Não foi possível validar pedidos agora.').length > 0;
          },
        },
        {
          key: 'vendas.pdv',
          title: 'Faça 1 venda no PDV',
          description: 'Finalize uma venda no PDV para validar operação rápida e sem retrabalho.',
          actionLabel: 'Abrir PDV',
          actionHref: '/app/vendas/pdv',
          check: async (supabase) => {
            const count = await safeRpcCount(supabase, 'vendas_count_pedidos_by_canal', { p_canal: 'pdv' });
            return requireKnown(count, 'Não foi possível validar PDV agora.') > 0;
          },
        },
        {
          key: 'vendas.expedicao',
          title: 'Faça 1 expedição',
          description: 'Separe e avance status de expedição para ter histórico e rastreabilidade.',
          actionLabel: 'Abrir Expedição',
          actionHref: '/app/vendas/expedicao',
          check: async (supabase) => {
            const has = await safeTableHasAny(supabase, 'vendas_expedicoes');
            return requireKnown(has, 'Não foi possível validar expedição agora.');
          },
        },
      ],
    },
    {
      key: 'suprimentos',
      title: 'Suprimentos',
      subtitle: 'Estoque → compras → recebimentos, sem “caixa preta”.',
      steps: [
        {
          key: 'suprimentos.estoque',
          title: 'Veja 1 posição de estoque',
          description: 'Estoque é o coração do suprimentos: saldos e movimentações confiáveis.',
          actionLabel: 'Abrir Controle de Estoques',
          actionHref: '/app/suprimentos/estoque',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'suprimentos_list_posicao_estoque', { p_search: null, p_baixo_estoque: false });
            return requireKnown(rows, 'Não foi possível validar estoque agora.').length > 0;
          },
        },
        {
          key: 'suprimentos.compras',
          title: 'Crie 1 Ordem de Compra',
          description: 'Crie uma OC para organizar recebimentos e custo/estoque.',
          actionLabel: 'Abrir Ordens de Compra',
          actionHref: '/app/suprimentos/compras',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'compras_list_pedidos', {
              p_search: null,
              p_status: null,
              p_limit: 1,
              p_offset: 0,
            });
            return requireKnown(rows, 'Não foi possível validar compras agora.').length > 0;
          },
        },
        {
          key: 'suprimentos.recebimentos',
          title: 'Registre 1 Recebimento',
          description: 'Registre recebimento e confira impacto em estoque e financeiro (quando aplicável).',
          actionLabel: 'Abrir Recebimentos',
          actionHref: '/app/suprimentos/recebimentos',
          check: async (supabase) => {
            const has = await safeTableHasAny(supabase, 'recebimentos');
            return requireKnown(has, 'Não foi possível validar recebimentos agora.');
          },
        },
      ],
    },
    {
      key: 'financeiro',
      title: 'Financeiro',
      subtitle: 'Tesouraria e contas a pagar/receber com saldo confiável.',
      steps: [
        {
          key: 'financeiro.conta_corrente',
          title: 'Cadastre 1 Conta Corrente',
          description: 'Conta corrente é necessária para tesouraria, extrato e conciliação.',
          actionLabel: 'Abrir Tesouraria',
          actionHref: '/app/financeiro/tesouraria',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'financeiro_contas_correntes_list', {
              p_search: null,
              p_ativo: true,
              p_limit: 1,
              p_offset: 0,
            });
            return requireKnown(rows, 'Não foi possível validar contas correntes agora.').length > 0;
          },
        },
        {
          key: 'financeiro.a_receber',
          title: 'Crie 1 Conta a Receber',
          description: 'Registre um recebimento previsto para controlar fluxo de caixa.',
          actionLabel: 'Abrir Contas a Receber',
          actionHref: '/app/financeiro/contas-a-receber',
          check: async (supabase) => {
            const count = await safeRpcCount(supabase, 'count_contas_a_receber_v2', {
              p_q: null,
              p_status: null,
              p_start_date: null,
              p_end_date: null,
            });
            return requireKnown(count, 'Não foi possível validar contas a receber agora.') > 0;
          },
        },
        {
          key: 'financeiro.a_pagar',
          title: 'Crie 1 Conta a Pagar',
          description: 'Registre um pagamento previsto para controlar despesas.',
          actionLabel: 'Abrir Contas a Pagar',
          actionHref: '/app/financeiro/contas-a-pagar',
          check: async (supabase) => {
            const count = await safeRpcCount(supabase, 'financeiro_contas_pagar_count', {
              p_q: null,
              p_status: null,
              p_start_date: null,
              p_end_date: null,
            });
            return requireKnown(count, 'Não foi possível validar contas a pagar agora.') > 0;
          },
        },
        {
          key: 'financeiro.extrato',
          title: 'Importe 1 Extrato Bancário',
          description: 'Tenha o extrato para conciliar e manter o saldo confiável.',
          actionLabel: 'Abrir Extrato Bancário',
          actionHref: '/app/financeiro/extrato',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'financeiro_extrato_bancario_list', {
              p_conciliado: null,
              p_conta_corrente_id: null,
              p_start_date: null,
              p_end_date: null,
              p_q: null,
              p_tipo_lancamento: null,
              p_limit: 1,
              p_offset: 0,
            });
            return requireKnown(rows, 'Não foi possível validar extrato agora.').length > 0;
          },
        },
      ],
    },
    {
      key: 'servicos',
      title: 'Serviços',
      subtitle: 'OS → execução → cobrança, com histórico e relatórios.',
      steps: [
        {
          key: 'servicos.os',
          title: 'Crie a 1ª Ordem de Serviço (OS)',
          description: 'Abra uma OS para um cliente e registre a demanda com status e prazos.',
          actionLabel: 'Abrir Ordens de Serviço',
          actionHref: '/app/ordens-de-servico',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'list_os_for_current_user', {
              p_search: null,
              p_status: null,
              p_limit: 1,
              p_offset: 0,
              p_order_by: 'ordem',
              p_order_dir: 'asc',
            });
            return requireKnown(rows, 'Não foi possível validar OS agora.').length > 0;
          },
        },
        {
          key: 'servicos.cobranca',
          title: 'Gere 1 cobrança / parcela',
          description: 'Conecte OS ao financeiro para receber com consistência e auditoria.',
          actionLabel: 'Abrir Cobranças',
          actionHref: '/app/servicos/cobrancas',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'financeiro_cobrancas_bancarias_list', {
              p_q: null,
              p_status: null,
              p_cliente_id: null,
              p_start_venc: null,
              p_end_venc: null,
              p_limit: 1,
              p_offset: 0,
            });
            return requireKnown(rows, 'Não foi possível validar cobranças agora.').length > 0;
          },
        },
        {
          key: 'servicos.relatorios',
          title: 'Veja o resumo de relatórios de OS',
          description: 'Valide KPIs e totais para ter “estado da arte” na operação.',
          actionLabel: 'Abrir Relatórios de Serviços',
          actionHref: '/app/servicos/relatorios',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'os_relatorios_list', {
              p_start_date: null,
              p_end_date: null,
              p_search: null,
              p_status: null,
              p_cliente_id: null,
              p_limit: 1,
              p_offset: 0,
            });
            return requireKnown(rows, 'Não foi possível validar relatórios de OS agora.').length > 0;
          },
        },
      ],
    },
    {
      key: 'industria',
      title: 'Indústria',
      subtitle: 'Do cadastro ao chão de fábrica — com controle real e rastreabilidade.',
      steps: [
        {
          key: 'industria.ct',
          title: 'Cadastre 1 Centro de Trabalho',
          description: 'Crie pelo menos um CT para organizar produção/beneficiamento e permitir execução.',
          actionLabel: 'Abrir Centros de Trabalho',
          actionHref: '/app/industria/centros-trabalho',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'industria_centros_trabalho_list', { p_search: null, p_ativo: true });
            return requireKnown(rows, 'Não foi possível validar centros de trabalho agora.').length > 0;
          },
        },
        {
          key: 'industria.roteiro',
          title: 'Crie 1 Roteiro',
          description: 'Defina as etapas e centros para o fluxo de produção/beneficiamento.',
          actionLabel: 'Abrir Roteiros',
          actionHref: '/app/industria/roteiros',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'industria_roteiros_list', {
              p_search: null,
              p_produto_id: null,
              p_tipo_bom: null,
              p_ativo: true,
            });
            return requireKnown(rows, 'Não foi possível validar roteiros agora.').length > 0;
          },
        },
        {
          key: 'industria.bom',
          title: 'Crie 1 Ficha Técnica (BOM)',
          description: 'Cadastre componentes e quantidades para calcular consumo e reservas.',
          actionLabel: 'Abrir Fichas Técnicas / BOM',
          actionHref: '/app/industria/boms',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'industria_bom_list', {
              p_search: null,
              p_produto_id: null,
              p_tipo_bom: null,
              p_ativo: true,
            });
            return requireKnown(rows, 'Não foi possível validar BOM agora.').length > 0;
          },
        },
        {
          key: 'industria.op',
          title: 'Abra a 1ª Ordem (OP/OB)',
          description: 'Crie uma ordem e aplique roteiro/BOM para preparar a execução.',
          actionLabel: 'Abrir OP / OB',
          actionHref: '/app/industria/ordens',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'industria_producao_list_ordens', { p_search: null, p_status: null });
            return requireKnown(rows, 'Não foi possível validar ordens agora.').length > 0;
          },
        },
        {
          key: 'industria.execucao',
          title: 'Faça 1 apontamento no Chão de Fábrica',
          description: 'Use a Tela do Operador para iniciar/pausar/concluir uma operação.',
          actionLabel: 'Abrir Tela do Operador',
          actionHref: '/app/industria/operador',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'industria_operacoes_list', {
              p_view: 'kanban',
              p_centro_id: null,
              p_status: null,
              p_search: null,
            });
            return requireKnown(rows, 'Não foi possível validar execução agora.').length > 0;
          },
        },
      ],
    },
    {
      key: 'fiscal',
      title: 'Fiscal (NF-e)',
      subtitle: 'Configuração e emissão — com segurança e rastreabilidade.',
      steps: [
        {
          key: 'fiscal.emitente',
          title: 'Cadastre o Emitente',
          description: 'Preencha dados da empresa emitente (certificado, ambiente, etc.).',
          actionLabel: 'Abrir Configurações NF-e',
          actionHref: '/app/fiscal/nfe/configuracoes',
          check: async (supabase) => {
            const row = await safeRpcValue<any>(supabase, 'fiscal_nfe_emitente_get');
            return requireKnown(row !== null, 'Não foi possível validar emitente agora.');
          },
        },
        {
          key: 'fiscal.numeracao',
          title: 'Defina Série e Numeração',
          description: 'Configure série, número inicial e ambiente para emitir com consistência.',
          actionLabel: 'Abrir Configurações NF-e',
          actionHref: '/app/fiscal/nfe/configuracoes',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'fiscal_nfe_numeracoes_list', {});
            return requireKnown(rows, 'Não foi possível validar numeração agora.').length > 0;
          },
        },
        {
          key: 'fiscal.rascunho',
          title: 'Crie 1 rascunho de NF-e',
          description: 'Gere um rascunho para validar motor fiscal e preview do XML.',
          actionLabel: 'Abrir NF-e (Rascunhos)',
          actionHref: '/app/fiscal/nfe',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'fiscal_nfe_emissoes_list', { p_status: null, p_q: null, p_limit: 1 });
            return requireKnown(rows, 'Não foi possível validar rascunhos de NF-e agora.').length > 0;
          },
        },
      ],
    },
    {
      key: 'integracoes',
      title: 'Integrações',
      subtitle: 'Conecte marketplaces e acompanhe saúde/reprocessamento sem abrir ticket.',
      steps: [
        {
          key: 'integracoes.meli',
          title: 'Conecte o Mercado Livre',
          description: 'Autorize e valide a conexão para importar pedidos e sincronizar o que for necessário.',
          actionLabel: 'Abrir Marketplaces',
          actionHref: '/app/configuracoes/ecommerce/marketplaces',
          check: async (supabase) => {
            const has = await safeTableHasAny(supabase, 'ecommerces', { provider: 'meli', status: 'connected' });
            return requireKnown(has, 'Não foi possível validar conexão Mercado Livre agora.');
          },
        },
        {
          key: 'integracoes.shopee',
          title: 'Conecte a Shopee',
          description: 'Prepare a conexão para centralizar pedidos e expedições no ERP.',
          actionLabel: 'Abrir Marketplaces',
          actionHref: '/app/configuracoes/ecommerce/marketplaces',
          check: async (supabase) => {
            const has = await safeTableHasAny(supabase, 'ecommerces', { provider: 'shopee', status: 'connected' });
            return requireKnown(has, 'Não foi possível validar conexão Shopee agora.');
          },
        },
        {
          key: 'integracoes.saude',
          title: 'Verifique o painel de saúde',
          description: 'Veja contadores e reprocessamento (DLQ) para reduzir suporte e retrabalho.',
          actionLabel: 'Abrir Saúde (Ops)',
          actionHref: '/app/dev/health',
          check: async () => true,
        },
      ],
    },
  ];
}
