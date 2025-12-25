import { callRpc } from '@/lib/api';

export type OsRelatoriosPorStatus = {
  status: string;
  qtd: number;
  total: number;
  custo: number;
};

export type OsRelatoriosTopCliente = {
  cliente_id: string | null;
  cliente_nome: string | null;
  qtd: number;
  faturamento: number;
  custo: number;
};

export type OsRelatoriosFaturamentoMensal = {
  mes: string; // YYYY-MM
  faturamento: number;
  custo_real: number;
  margem: number;
  recebido?: number;
};

export type OsRelatoriosResumo = {
  periodo: { inicio: string; fim: string };
  kpis: {
    total_os: number;
    total_orcamento: number;
    total_aberta: number;
    total_concluida: number;
    total_cancelada: number;
    faturamento: number;
    custo_real: number;
    margem: number;
    recebido?: number;
    a_receber?: number;
  };
  por_status: OsRelatoriosPorStatus[];
  top_clientes: OsRelatoriosTopCliente[];
  faturamento_mensal: OsRelatoriosFaturamentoMensal[];
};

export async function getOsRelatoriosResumo(params: {
  startDate?: Date | null;
  endDate?: Date | null;
}): Promise<OsRelatoriosResumo> {
  return callRpc<OsRelatoriosResumo>('os_relatorios_resumo', {
    p_start_date: params.startDate ? params.startDate.toISOString().slice(0, 10) : null,
    p_end_date: params.endDate ? params.endDate.toISOString().slice(0, 10) : null,
  });
}

export type OsRelatoriosListRow = {
  id: string;
  numero: number;
  descricao: string;
  status: string;
  data_ref: string; // YYYY-MM-DD
  cliente_nome: string | null;
  total_geral: number;
  custo_real: number;
  margem: number;
  total_count: number;
};

export async function listOsRelatorios(params: {
  startDate?: Date | null;
  endDate?: Date | null;
  search?: string | null;
  status?: string[] | null;
  clienteId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ data: OsRelatoriosListRow[]; count: number }> {
  const data = await callRpc<OsRelatoriosListRow[]>('os_relatorios_list', {
    p_start_date: params.startDate ? params.startDate.toISOString().slice(0, 10) : null,
    p_end_date: params.endDate ? params.endDate.toISOString().slice(0, 10) : null,
    p_search: params.search ?? null,
    p_status: params.status ?? null,
    p_cliente_id: params.clienteId ?? null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });

  if (!data || data.length === 0) return { data: [], count: 0 };
  return { data, count: Number(data[0].total_count ?? 0) };
}
