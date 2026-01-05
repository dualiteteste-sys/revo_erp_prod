import { callRpc } from '@/lib/api';

export type FinanceiroRelatoriosSerie = {
  mes: string; // YYYY-MM
  entradas: number;
  saidas: number;
  receber_pago: number;
  pagar_pago: number;
};

export type FinanceiroRelatoriosResumo = {
  periodo: { inicio: string; fim: string };
  receber: {
    total_pendente: number;
    total_vencido: number;
    total_cancelado: number;
    total_pago: number;
    qtd_pendente: number;
    qtd_vencido: number;
    qtd_pago: number;
  };
  pagar: {
    total_aberta: number;
    total_parcial: number;
    total_cancelada: number;
    total_paga: number;
    total_vencida: number;
    qtd_aberta: number;
    qtd_parcial: number;
    qtd_paga: number;
  };
  caixa: {
    contas_ativas: number;
    saldo_total: number;
  };
  series: FinanceiroRelatoriosSerie[];
};

export type FinanceiroPorCentroCustoRow = {
  centro_id: string | null;
  centro_nome: string;
  entradas: number;
  saidas: number;
};

export type FinanceiroDreLinha = {
  categoria: string;
  receitas: number;
  despesas: number;
  resultado: number;
};

export type FinanceiroDreSimplificada = {
  periodo: { inicio: string; fim: string };
  centro_de_custo_id: string | null;
  totais: {
    receitas: number;
    despesas: number;
    resultado: number;
  };
  linhas: FinanceiroDreLinha[];
};

export async function getFinanceiroRelatoriosResumo(params: {
  startDate?: Date | null;
  endDate?: Date | null;
}): Promise<FinanceiroRelatoriosResumo> {
  const payload = {
    p_start_date: params.startDate ? params.startDate.toISOString().slice(0, 10) : null,
    p_end_date: params.endDate ? params.endDate.toISOString().slice(0, 10) : null,
  };
  return callRpc<FinanceiroRelatoriosResumo>('financeiro_relatorios_resumo', payload);
}

export async function listFinanceiroPorCentroCusto(params: {
  startDate?: Date | null;
  endDate?: Date | null;
}): Promise<FinanceiroPorCentroCustoRow[]> {
  return callRpc<FinanceiroPorCentroCustoRow[]>('financeiro_relatorio_por_centro_custo', {
    p_start_date: params.startDate ? params.startDate.toISOString().slice(0, 10) : null,
    p_end_date: params.endDate ? params.endDate.toISOString().slice(0, 10) : null,
  });
}

export async function getFinanceiroDreSimplificada(params: {
  startDate?: Date | null;
  endDate?: Date | null;
  centroDeCustoId?: string | null;
}): Promise<FinanceiroDreSimplificada> {
  return callRpc<FinanceiroDreSimplificada>('financeiro_dre_simplificada', {
    p_start_date: params.startDate ? params.startDate.toISOString().slice(0, 10) : null,
    p_end_date: params.endDate ? params.endDate.toISOString().slice(0, 10) : null,
    p_centro_de_custo_id: params.centroDeCustoId ?? null,
  });
}
