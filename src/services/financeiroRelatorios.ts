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

export type FinanceiroDreMapeamentoV1 = {
  id: string;
  origem_tipo: 'mov_categoria';
  origem_valor: string;
  dre_linha_key: string;
  created_at: string;
  updated_at: string;
};

export type FinanceiroDreUnmappedCategoriaV1 = {
  categoria: string;
  entradas: number;
  saidas: number;
  resultado: number;
  n_lancamentos: number;
};

export type FinanceiroDreReportV1 = {
  meta: {
    start_date: string;
    end_date: string;
    regime: 'competencia' | 'caixa';
    centro_de_custo_id: string | null;
  };
  linhas: Record<string, number>;
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

export async function listFinanceiroDreMapeamentosV1(): Promise<FinanceiroDreMapeamentoV1[]> {
  const rows = await callRpc<FinanceiroDreMapeamentoV1[]>('financeiro_dre_mapeamentos_list_v1', {});
  return Array.isArray(rows) ? rows : [];
}

export async function setFinanceiroDreMapeamentoV1(params: {
  origemTipo?: 'mov_categoria';
  origemValor: string;
  dreLinhaKey: string;
}): Promise<FinanceiroDreMapeamentoV1> {
  const rows = await callRpc<FinanceiroDreMapeamentoV1[]>('financeiro_dre_mapeamentos_set_v1', {
    p_origem_tipo: params.origemTipo ?? 'mov_categoria',
    p_origem_valor: params.origemValor,
    p_dre_linha_key: params.dreLinhaKey,
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('Falha ao salvar mapeamento do DRE.');
  return row as FinanceiroDreMapeamentoV1;
}

export async function deleteFinanceiroDreMapeamentoV1(id: string): Promise<void> {
  await callRpc('financeiro_dre_mapeamentos_delete_v1', { p_id: id });
}

export async function listFinanceiroDreUnmappedCategoriasV1(params: {
  startDate?: Date | null;
  endDate?: Date | null;
  regime?: 'competencia' | 'caixa';
  centroDeCustoId?: string | null;
}): Promise<FinanceiroDreUnmappedCategoriaV1[]> {
  const rows = await callRpc<FinanceiroDreUnmappedCategoriaV1[]>('financeiro_dre_unmapped_categorias_v1', {
    p_start_date: params.startDate ? params.startDate.toISOString().slice(0, 10) : null,
    p_end_date: params.endDate ? params.endDate.toISOString().slice(0, 10) : null,
    p_regime: params.regime ?? 'competencia',
    p_centro_de_custo_id: params.centroDeCustoId ?? null,
  });
  return Array.isArray(rows) ? rows : [];
}

export async function getFinanceiroDreReportV1(params: {
  startDate?: Date | null;
  endDate?: Date | null;
  regime?: 'competencia' | 'caixa';
  centroDeCustoId?: string | null;
}): Promise<FinanceiroDreReportV1 | null> {
  const raw = await callRpc<unknown>('financeiro_dre_report_v1', {
    p_start_date: params.startDate ? params.startDate.toISOString().slice(0, 10) : null,
    p_end_date: params.endDate ? params.endDate.toISOString().slice(0, 10) : null,
    p_regime: params.regime ?? 'competencia',
    p_centro_de_custo_id: params.centroDeCustoId ?? null,
  });

  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (!('meta' in record) || !('linhas' in record)) return null;
  return record as unknown as FinanceiroDreReportV1;
}
