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

export function getRoadmaps(): RoadmapGroup[] {
  return [
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
          actionHref: '/app/industria/centros-de-trabalho',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'industria_centros_trabalho_list', { p_search: null, p_ativo: true });
            return (rows?.length ?? 0) > 0;
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
            return (rows?.length ?? 0) > 0;
          },
        },
        {
          key: 'industria.bom',
          title: 'Crie 1 Ficha Técnica (BOM)',
          description: 'Cadastre componentes e quantidades para calcular consumo e reservas.',
          actionLabel: 'Abrir Fichas Técnicas',
          actionHref: '/app/industria/bom',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'industria_bom_list', {
              p_search: null,
              p_produto_id: null,
              p_tipo_bom: null,
              p_ativo: true,
            });
            return (rows?.length ?? 0) > 0;
          },
        },
        {
          key: 'industria.op',
          title: 'Abra a 1ª Ordem (OP/OB)',
          description: 'Crie uma ordem e aplique roteiro/BOM para preparar a execução.',
          actionLabel: 'Abrir Ordens',
          actionHref: '/app/industria/ordens',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'industria_producao_list_ordens', { p_search: null, p_status: null });
            return (rows?.length ?? 0) > 0;
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
            // Heurística: se existe ao menos 1 operação já criada, o chão de fábrica está “vivo”.
            // (Em uma fase 2, podemos validar apontamentos por audit/apontamentos.)
            return (rows?.length ?? 0) > 0;
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
          key: 'servicos.cadastro',
          title: 'Cadastre 1 Serviço',
          description: 'Crie um serviço com preço e status ativo para usar em OS e notas.',
          actionLabel: 'Abrir Serviços',
          actionHref: '/app/cadastros/servicos',
          check: async (supabase) => {
            const count = await safeRpcCount(supabase, 'count_services_for_current_user', {
              p_search: null,
              p_status: 'ativo',
            });
            if (count !== null) return count > 0;
            const rows = await safeRpcList<any>(supabase, 'list_services_for_current_user_v2', {
              p_offset: 0,
              p_limit: 1,
              p_search: null,
              p_status: 'ativo',
              p_order_by: 'descricao',
              p_order_dir: 'asc',
            });
            return (rows?.length ?? 0) > 0;
          },
        },
        {
          key: 'servicos.os',
          title: 'Crie a 1ª Ordem de Serviço (OS)',
          description: 'Abra uma OS para um cliente e registre a demanda com status e prazos.',
          actionLabel: 'Abrir OS',
          actionHref: '/app/servicos/os',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'list_os_for_current_user', {
              p_search: null,
              p_status: null,
              p_limit: 1,
              p_offset: 0,
              p_order_by: 'ordem',
              p_order_dir: 'asc',
            });
            return (rows?.length ?? 0) > 0;
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
            return (rows?.length ?? 0) > 0;
          },
        },
      ],
    },
    {
      key: 'comercio',
      title: 'Comércio',
      subtitle: 'Cadastros → pedidos → PDV/expedição, com financeiro forte.',
      steps: [
        {
          key: 'comercio.produtos',
          title: 'Cadastre 1 Produto',
          description: 'Crie um produto ativo para vender em pedidos e PDV.',
          actionLabel: 'Abrir Produtos',
          actionHref: '/app/produtos',
          check: async (supabase) => {
            const count = await safeRpcCount(supabase, 'produtos_count_for_current_user', { p_q: null, p_status: null });
            return (count ?? 0) > 0;
          },
        },
        {
          key: 'comercio.clientes',
          title: 'Cadastre 1 Cliente',
          description: 'Crie um cliente (ou parceiro) para permitir emissão de pedidos e notas.',
          actionLabel: 'Abrir Clientes',
          actionHref: '/app/cadastros/clientes',
          check: async (supabase) => {
            const count = await safeRpcCount(supabase, 'count_partners_v2', { p_search: null, p_tipo: 'cliente', p_status: 'active' });
            if (count !== null) return count > 0;
            const legacy = await safeRpcCount(supabase, 'count_partners', { p_q: null, p_tipo: 'cliente' });
            return (legacy ?? 0) > 0;
          },
        },
        {
          key: 'comercio.pedido',
          title: 'Crie o 1º Pedido de Venda',
          description: 'Monte um pedido com itens e veja o fluxo completo até o financeiro.',
          actionLabel: 'Abrir Pedidos',
          actionHref: '/app/vendas/pedidos',
          check: async (supabase) => {
            const rows = await safeRpcList<any>(supabase, 'vendas_list_pedidos', { p_search: null, p_status: null });
            return (rows?.length ?? 0) > 0;
          },
        },
        {
          key: 'comercio.pdv',
          title: 'Faça uma venda no PDV',
          description: 'Finalize uma venda no PDV para validar velocidade e consistência.',
          actionLabel: 'Abrir PDV',
          actionHref: '/app/vendas/pdv',
          check: async (supabase) => {
            const { data, error } = await supabase
              .from('vendas_pedidos')
              .select('id')
              .eq('canal', 'pdv')
              .limit(1);
            if (error) return false;
            return (data?.length ?? 0) > 0;
          },
        },
      ],
    },
  ];
}
