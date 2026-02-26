import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';
import { faker } from '@faker-js/faker';
import { getPartners } from './partners';

export type ContaAReceber = {
  id: string;
  empresa_id?: string | null;
  status: string;
  descricao?: string | null;
  observacoes?: string | null;

  cliente_id?: string | null;
  cliente_nome?: string | null;

  valor?: number | null;
  data_vencimento?: string | null;

  data_pagamento?: string | null;
  valor_pago?: number | null;

  centro_de_custo_id?: string | null;
  centro_custo?: string | null;

  origem_tipo?: string | null;
  origem_id?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
} & Record<string, unknown>;

export type ContaAReceberPayload = Partial<ContaAReceber>;

export type ContasAReceberSummary = {
    total_pendente: number;
    total_pago_mes: number;
    total_vencido: number;
};

function toSafeInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function toSafeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return null;
  if (!('message' in error)) return null;
  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' ? message : null;
}

export type ContaAReceberRecebimento = {
  id: string;
  data_recebimento: string;
  valor: number;
  conta_corrente_id: string;
  conta_corrente_nome: string | null;
  observacoes: string | null;
  estornado: boolean;
  estornado_at: string | null;
  estorno_motivo: string | null;
  movimentacao_id: string | null;
  movimentacao_conciliada: boolean;
  created_at: string;
};

export async function listContaAReceberRecebimentos(contaAReceberId: string): Promise<ContaAReceberRecebimento[]> {
  try {
    const data = await callRpc<ContaAReceberRecebimento[]>('financeiro_conta_a_receber_recebimentos_list', {
      p_conta_a_receber_id: contaAReceberId,
    });
    return data || [];
  } catch (error: unknown) {
    console.error('[SERVICE][LIST_CONTA_A_RECEBER_RECEBIMENTOS]', error);
    throw new Error(getErrorMessage(error) || 'Não foi possível carregar os recebimentos.');
  }
}

export async function estornarContaAReceberRecebimento(params: {
  recebimentoId: string;
  dataEstorno?: string | null;
  contaCorrenteId?: string | null;
  motivo?: string | null;
}): Promise<ContaAReceber> {
  try {
    return await callRpc<ContaAReceber>('financeiro_conta_a_receber_recebimento_estornar', {
      p_recebimento_id: params.recebimentoId,
      p_data_estorno: params.dataEstorno ?? null,
      p_conta_corrente_id: params.contaCorrenteId ?? null,
      p_motivo: params.motivo ?? null,
    });
  } catch (error: unknown) {
    console.error('[SERVICE][ESTORNAR_CONTA_A_RECEBER_RECEBIMENTO]', error);
    throw new Error(getErrorMessage(error) || 'Erro ao estornar o recebimento.');
  }
}

export async function getContaAReceberFromOs(osId: string): Promise<string | null> {
  try {
    const result = await callRpc<string | null>('financeiro_conta_a_receber_from_os_get', { p_os_id: osId });
    return result || null;
  } catch (error: any) {
    console.error('[SERVICE][GET_CONTA_A_RECEBER_FROM_OS]', error);
    return null;
  }
}

export async function createContaAReceberFromOs(params: { osId: string; dataVencimento?: string | null }): Promise<ContaAReceber> {
  try {
    return await callRpc<ContaAReceber>('financeiro_conta_a_receber_from_os_create', {
      p_os_id: params.osId,
      p_data_vencimento: params.dataVencimento ?? null,
    });
  } catch (error: any) {
    console.error('[SERVICE][CREATE_CONTA_A_RECEBER_FROM_OS]', error);
    throw new Error(error.message || 'Erro ao gerar conta a receber a partir da OS.');
  }
}

export async function createContasAReceberFromOsParcelas(osId: string): Promise<ContaAReceber[]> {
  try {
    return await callRpc<ContaAReceber[]>('financeiro_contas_a_receber_from_os_parcelas_create', {
      p_os_id: osId,
    });
  } catch (error: any) {
    console.error('[SERVICE][CREATE_CONTAS_A_RECEBER_FROM_OS_PARCELAS]', error);
    throw new Error(error.message || 'Erro ao gerar contas a receber (parcelas) a partir da OS.');
  }
}

export async function listContasAReceber(options: {
    page: number;
    pageSize: number;
    searchTerm: string;
    status: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    sortBy: { column: string; ascending: boolean };
}): Promise<{ data: ContaAReceber[]; count: number }> {
    const { page, pageSize, searchTerm, status, sortBy, startDate, endDate } = options;
    const offset = (page - 1) * pageSize;
    
	    try {
	        const count = await callRpc<number>('count_contas_a_receber_v2', {
	            p_q: searchTerm || null,
	            p_status: status || null,
	            p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
	            p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
	        });

        const safeCount = toSafeInt(count);
        if (safeCount === 0) {
            return { data: [], count: 0 };
        }

	        const data = await callRpc<ContaAReceber[]>('list_contas_a_receber_v2', {
	            p_limit: pageSize,
	            p_offset: offset,
	            p_q: searchTerm || null,
	            p_status: status || null,
	            p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
	            p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
	            p_order_by: sortBy.column,
	            p_order_dir: sortBy.ascending ? 'asc' : 'desc',
	        });

        return { data: data ?? [], count: safeCount };
    } catch (error) {
        console.error('[SERVICE][LIST_CONTAS_A_RECEBER]', error);
        throw new Error('Não foi possível listar as contas a receber.');
    }
}

export type ContasAReceberSelectionTotals = {
  selected_count: number;
  total_valor: number;
  total_recebido: number;
  total_saldo: number;
  total_vencido: number;
  total_a_vencer: number;
};

export async function getContasAReceberSelectionTotals(params: {
  mode: 'explicit' | 'all_matching';
  ids: string[];
  excludedIds: string[];
  q: string | null;
  status: string | null;
  startDateISO: string | null;
  endDateISO: string | null;
}): Promise<ContasAReceberSelectionTotals> {
  try {
    const data = await callRpc<Partial<ContasAReceberSelectionTotals>>('financeiro_contas_a_receber_selection_totals', {
      p_mode: params.mode,
      p_ids: params.ids.length ? params.ids : null,
      p_excluded_ids: params.excludedIds.length ? params.excludedIds : null,
      p_q: params.q || null,
      p_status: params.status || null,
      p_start_date: params.startDateISO,
      p_end_date: params.endDateISO,
    });
    return {
      selected_count: toSafeInt(data?.selected_count),
      total_valor: toSafeNumber(data?.total_valor),
      total_recebido: toSafeNumber(data?.total_recebido),
      total_saldo: toSafeNumber(data?.total_saldo),
      total_vencido: toSafeNumber(data?.total_vencido),
      total_a_vencer: toSafeNumber(data?.total_a_vencer),
    };
  } catch (error: unknown) {
    console.error('[SERVICE][CONTAS_RECEBER_SELECTION_TOTALS]', error);
    throw new Error(getErrorMessage(error) || 'Não foi possível calcular os totais da seleção.');
  }
}

export async function getContaAReceberDetails(id: string): Promise<ContaAReceber> {
    try {
        return await callRpc<ContaAReceber>('get_conta_a_receber_details', { p_id: id });
    } catch (error) {
        console.error('[SERVICE][GET_CONTA_A_RECEBER_DETAILS]', error);
        throw new Error('Erro ao buscar detalhes da conta.');
    }
}

export async function saveContaAReceber(payload: ContaAReceberPayload): Promise<ContaAReceber> {
    try {
        return await callRpc<ContaAReceber>('create_update_conta_a_receber', { p_payload: payload });
    } catch (error: any) {
        console.error('[SERVICE][SAVE_CONTA_A_RECEBER]', error);
        throw new Error(error.message || 'Erro ao salvar a conta.');
    }
}

export async function receberContaAReceber(params: {
  id: string;
  dataPagamento?: string;
  valorPago?: number;
  contaCorrenteId?: string | null;
}): Promise<ContaAReceber> {
  try {
    try {
      return await callRpc<ContaAReceber>('financeiro_conta_a_receber_receber_v2', {
        p_id: params.id,
        p_data_pagamento: params.dataPagamento ?? null,
        p_valor_pago: params.valorPago ?? null,
        p_conta_corrente_id: params.contaCorrenteId ?? null,
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!msg.includes('Could not find the function') && !msg.includes('PGRST202')) {
        throw e;
      }
      return await callRpc<ContaAReceber>('financeiro_conta_a_receber_receber', {
        p_id: params.id,
        p_data_pagamento: params.dataPagamento ?? null,
        p_valor_pago: params.valorPago ?? null,
      });
    }
  } catch (error: any) {
    console.error('[SERVICE][RECEBER_CONTA_A_RECEBER]', error);
    throw new Error(error.message || 'Erro ao registrar recebimento.');
  }
}

export async function cancelarContaAReceber(params: { id: string; motivo?: string | null }): Promise<ContaAReceber> {
  try {
    return await callRpc<ContaAReceber>('financeiro_conta_a_receber_cancelar', {
      p_id: params.id,
      p_motivo: params.motivo ?? null,
    });
  } catch (error: any) {
    console.error('[SERVICE][CANCELAR_CONTA_A_RECEBER]', error);
    throw new Error(error.message || 'Erro ao cancelar a conta.');
  }
}

export async function estornarContaAReceber(params: {
  id: string;
  dataEstorno?: string | null;
  contaCorrenteId?: string | null;
  motivo?: string | null;
}): Promise<ContaAReceber> {
  try {
    try {
      return await callRpc<ContaAReceber>('financeiro_conta_a_receber_estornar_v2', {
        p_id: params.id,
        p_data_estorno: params.dataEstorno ?? null,
        p_conta_corrente_id: params.contaCorrenteId ?? null,
        p_motivo: params.motivo ?? null,
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!msg.includes('Could not find the function') && !msg.includes('PGRST202')) {
        throw e;
      }
      return await callRpc<ContaAReceber>('financeiro_conta_a_receber_estornar', {
        p_id: params.id,
        p_data_estorno: params.dataEstorno ?? null,
      });
    }
  } catch (error: any) {
    console.error('[SERVICE][ESTORNAR_CONTA_A_RECEBER]', error);
    throw new Error(error.message || 'Erro ao estornar o recebimento.');
  }
}

export async function deleteContaAReceber(id: string): Promise<void> {
    try {
        await callRpc('delete_conta_a_receber', { p_id: id });
    } catch (error: any) {
        console.error('[SERVICE][DELETE_CONTA_A_RECEBER]', error);
        throw new Error(error.message || 'Erro ao excluir a conta.');
    }
}

export async function getContasAReceberSummary(startDate?: Date | null, endDate?: Date | null): Promise<ContasAReceberSummary> {
    try {
        const result = await callRpc<ContasAReceberSummary[]>('get_contas_a_receber_summary_v2', {
          p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
          p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
        });
        return result[0] || { total_pendente: 0, total_pago_mes: 0, total_vencido: 0 };
    } catch (error) {
        console.error('[SERVICE][GET_CONTAS_A_RECEBER_SUMMARY]', error);
        throw new Error('Erro ao buscar o resumo financeiro.');
    }
}

export async function seedContasAReceber(): Promise<void> {
  // Busca clientes existentes para vincular
  const { data: partners } = await getPartners({ 
    page: 1, 
    pageSize: 100, 
    searchTerm: '', 
    filterType: 'cliente', 
    sortBy: { column: 'nome', ascending: true } 
  });
  
  if (partners.length === 0) throw new Error('Crie clientes antes de gerar contas a receber.');

  const promises = Array.from({ length: 5 }).map(() => {
    const partner = faker.helpers.arrayElement(partners);
    const status = faker.helpers.arrayElement(['pendente', 'pago', 'vencido']);
    const valor = parseFloat(faker.finance.amount(100, 5000, 2));
    
    let dataVencimento = faker.date.soon({ days: 30 });
    if (status === 'vencido') {
        dataVencimento = faker.date.recent({ days: 30 });
    }

	    const payload: ContaAReceberPayload = {
	      cliente_id: partner.id,
	      descricao: `Venda de ${faker.commerce.productName()}`,
	      valor: valor,
	      data_vencimento: dataVencimento.toISOString().split('T')[0],
	      status,
	      observacoes: 'Gerado automaticamente',
	      data_pagamento: status === 'pago' ? faker.date.recent({ days: 5 }).toISOString().split('T')[0] : undefined,
	      valor_pago: status === 'pago' ? valor : undefined,
	    };
    return saveContaAReceber(payload);
  });
  await Promise.all(promises);
}
