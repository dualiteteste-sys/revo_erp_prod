import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';
import { faker } from '@faker-js/faker';
import { getPartners } from './partners';

export type ContaAReceber = Database['public']['Tables']['contas_a_receber']['Row'] & {
    cliente_nome?: string;
};

export type ContaAReceberPayload = Partial<ContaAReceber>;

export type ContasAReceberSummary = {
    total_pendente: number;
    total_pago_mes: number;
    total_vencido: number;
};

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

export async function listContasAReceber(options: {
    page: number;
    pageSize: number;
    searchTerm: string;
    status: string | null;
    sortBy: { column: string; ascending: boolean };
}): Promise<{ data: ContaAReceber[]; count: number }> {
    const { page, pageSize, searchTerm, status, sortBy } = options;
    const offset = (page - 1) * pageSize;
    
    try {
        const count = await callRpc<number>('count_contas_a_receber', {
            p_q: searchTerm || null,
            p_status: status as any || null,
        });

        if (Number(count) === 0) {
            return { data: [], count: 0 };
        }

        const data = await callRpc<ContaAReceber[]>('list_contas_a_receber', {
            p_limit: pageSize,
            p_offset: offset,
            p_q: searchTerm || null,
            p_status: status as any || null,
            p_order_by: sortBy.column,
            p_order_dir: sortBy.ascending ? 'asc' : 'desc',
        });

        return { data: data ?? [], count: Number(count) };
    } catch (error) {
        console.error('[SERVICE][LIST_CONTAS_A_RECEBER]', error);
        throw new Error('Não foi possível listar as contas a receber.');
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

export async function deleteContaAReceber(id: string): Promise<void> {
    try {
        await callRpc('delete_conta_a_receber', { p_id: id });
    } catch (error: any) {
        console.error('[SERVICE][DELETE_CONTA_A_RECEBER]', error);
        throw new Error(error.message || 'Erro ao excluir a conta.');
    }
}

export async function getContasAReceberSummary(): Promise<ContasAReceberSummary> {
    try {
        const result = await callRpc<ContasAReceberSummary[]>('get_contas_a_receber_summary', {});
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
      status: status as any,
      observacoes: 'Gerado automaticamente',
      data_pagamento: status === 'pago' ? faker.date.recent({ days: 5 }).toISOString().split('T')[0] : undefined,
      valor_pago: status === 'pago' ? valor : undefined,
    };
    return saveContaAReceber(payload);
  });
  await Promise.all(promises);
}
