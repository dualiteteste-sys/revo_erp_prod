import { callRpc } from '@/lib/api';

export type ExtratoLancamento = {
  id: string;
  conta_corrente_id: string;
  conta_nome: string;
  data_lancamento: string;
  descricao: string;
  documento_ref: string | null;
  tipo_lancamento: 'credito' | 'debito';
  valor: number;
  saldo_apos_lancamento: number | null;
  conciliado: boolean;
  movimentacao_id: string | null;
  movimentacao_data: string | null;
  movimentacao_tipo: string | null;
  movimentacao_descricao: string | null;
  movimentacao_valor: number | null;
  total_count?: number;
};

export type ExtratoSummary = {
  saldo_inicial: number;
  creditos: number;
  debitos: number;
  saldo_final: number;
  creditos_nao_conciliados: number;
  debitos_nao_conciliados: number;
};

export async function listExtrato(options: {
  page: number;
  pageSize: number;
  contaCorrenteId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  tipoLancamento?: 'credito' | 'debito' | null;
  conciliado?: boolean | null;
  searchTerm?: string;
}): Promise<{ data: ExtratoLancamento[]; count: number }> {
  const { page, pageSize, contaCorrenteId, startDate, endDate, tipoLancamento, conciliado, searchTerm } = options;
  const offset = (page - 1) * pageSize;

  try {
    const data = await callRpc<ExtratoLancamento[]>('financeiro_extrato_bancario_list', {
      p_conta_corrente_id: contaCorrenteId || null,
      p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
      p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
      p_tipo_lancamento: tipoLancamento || null,
      p_conciliado: conciliado,
      p_q: searchTerm || null,
      p_limit: pageSize,
      p_offset: offset,
    });

    if (!data || data.length === 0) {
      return { data: [], count: 0 };
    }

    const count = Number(data[0].total_count);
    return { data, count };
  } catch (error: any) {
    console.error('[SERVICE][LIST_EXTRATO]', error);
    throw new Error(error.message || 'Não foi possível listar o extrato.');
  }
}

export async function getExtratoSummary(
  contaCorrenteId: string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<ExtratoSummary> {
  try {
    const result = await callRpc<ExtratoSummary>('financeiro_extrato_bancario_summary', {
      p_conta_corrente_id: contaCorrenteId,
      p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
      p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
    });
    return result || { 
        saldo_inicial: 0, 
        creditos: 0, 
        debitos: 0, 
        saldo_final: 0, 
        creditos_nao_conciliados: 0, 
        debitos_nao_conciliados: 0 
    };
  } catch (error: any) {
    console.error('[SERVICE][GET_EXTRATO_SUMMARY]', error);
    throw new Error(error.message || 'Erro ao buscar resumo do extrato.');
  }
}
