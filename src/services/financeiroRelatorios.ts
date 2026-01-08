import { callRpc, isRpcMissingError } from '@/lib/api';

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

let financeiroPorCentroCustoAvailable: boolean | null = null;

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
  if (financeiroPorCentroCustoAvailable === false) return [];
  try {
    const rows = await callRpc<FinanceiroPorCentroCustoRow[]>('financeiro_relatorio_por_centro_custo', {
      p_start_date: params.startDate ? params.startDate.toISOString().slice(0, 10) : null,
      p_end_date: params.endDate ? params.endDate.toISOString().slice(0, 10) : null,
    });
    financeiroPorCentroCustoAvailable = true;
    return rows;
  } catch (err) {
    // Ambientes sem FIN-04 aplicado: não derruba a tela inteira.
    if (isRpcMissingError(err)) {
      financeiroPorCentroCustoAvailable = false;
      return [];
    }
    throw err;
  }
}

export async function getFinanceiroDreSimplificada(params: {
  startDate?: Date | null;
  endDate?: Date | null;
  centroDeCustoId?: string | null;
}): Promise<FinanceiroDreSimplificada | null> {
  const raw = await callRpc<any>('financeiro_dre_simplificada', {
    p_start_date: params.startDate ? params.startDate.toISOString().slice(0, 10) : null,
    p_end_date: params.endDate ? params.endDate.toISOString().slice(0, 10) : null,
    p_centro_de_custo_id: params.centroDeCustoId ?? null,
  });

  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== 'object') return null;
  if (!('totais' in data) || (data as any).totais == null) return null;
  return data as FinanceiroDreSimplificada;
}
