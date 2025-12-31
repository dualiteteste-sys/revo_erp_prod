import { callRpc } from '@/lib/api';

export type VendasDashboardStats = {
  period: { start: string; end: string; group: 'day' | 'month' };
  kpis: {
    faturamento_total: number;
    ticket_medio: number;
    pedidos_concluidos: number;
    clientes_ativos: number;
  };
  status: Array<{ status: string; count: number }>;
  series: Array<{ label: string; total: number }>;
  top_vendedores: Array<{ vendedor_id: string; nome: string; total: number }>;
  top_produtos: Array<{ produto_id: string; nome: string; quantidade: number; total: number }>;
};

export async function getVendasDashboardStats(params: {
  startDate?: string | null;
  endDate?: string | null;
  canal?: 'erp' | 'pdv' | null;
  vendedorId?: string | null;
}): Promise<VendasDashboardStats> {
  return callRpc<VendasDashboardStats>('vendas_dashboard_stats', {
    p_start_date: params.startDate || null,
    p_end_date: params.endDate || null,
    p_canal: params.canal || null,
    p_vendedor_id: params.vendedorId || null,
  });
}

