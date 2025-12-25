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

