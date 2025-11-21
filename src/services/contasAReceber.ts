import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';

export type ContaAReceber = Database['public']['Tables']['contas_a_receber']['Row'] & {
    cliente_nome?: string;
};

export type ContaAReceberPayload = Partial<ContaAReceber>;

export type ContasAReceberSummary = {
    total_pendente: number;
    total_pago_mes: number;
    total_vencido: number;
};

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
