import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';

export type ContaPagar = Database['public']['Tables']['contas_a_pagar']['Row'] & {
    fornecedor_nome?: string;
};

export type ContaPagarPayload = Partial<ContaPagar>;

export type ContasPagarSummary = {
    total_pendente: number;
    total_pago_mes: number;
    total_vencido: number;
};

export async function listContasPagar(options: {
    page: number;
    pageSize: number;
    searchTerm: string;
    status: string | null;
    sortBy: { column: string; ascending: boolean };
}): Promise<{ data: ContaPagar[]; count: number }> {
    const { page, pageSize, searchTerm, status, sortBy } = options;
    const offset = (page - 1) * pageSize;
    
    try {
        const count = await callRpc<number>('count_contas_a_pagar', {
            p_q: searchTerm || null,
            p_status: status as any || null,
        });

        if (Number(count) === 0) {
            return { data: [], count: 0 };
        }

        const data = await callRpc<ContaPagar[]>('list_contas_a_pagar', {
            p_limit: pageSize,
            p_offset: offset,
            p_q: searchTerm || null,
            p_status: status as any || null,
            p_order_by: sortBy.column,
            p_order_dir: sortBy.ascending ? 'asc' : 'desc',
        });

        return { data: data ?? [], count: Number(count) };
    } catch (error) {
        console.error('[SERVICE][LIST_CONTAS_PAGAR]', error);
        throw new Error('Não foi possível listar as contas a pagar.');
    }
}

export async function getContaPagarDetails(id: string): Promise<ContaPagar> {
    try {
        return await callRpc<ContaPagar>('get_conta_a_pagar_details', { p_id: id });
    } catch (error) {
        console.error('[SERVICE][GET_CONTA_PAGAR_DETAILS]', error);
        throw new Error('Erro ao buscar detalhes da conta.');
    }
}

export async function saveContaPagar(payload: ContaPagarPayload): Promise<ContaPagar> {
    try {
        return await callRpc<ContaPagar>('create_update_conta_a_pagar', { p_payload: payload });
    } catch (error: any) {
        console.error('[SERVICE][SAVE_CONTA_PAGAR]', error);
        throw new Error(error.message || 'Erro ao salvar a conta.');
    }
}

export async function deleteContaPagar(id: string): Promise<void> {
    try {
        await callRpc('delete_conta_a_pagar', { p_id: id });
    } catch (error: any) {
        console.error('[SERVICE][DELETE_CONTA_PAGAR]', error);
        throw new Error(error.message || 'Erro ao excluir a conta.');
    }
}

export async function getContasPagarSummary(): Promise<ContasPagarSummary> {
    try {
        const result = await callRpc<ContasPagarSummary[]>('get_contas_a_pagar_summary', {});
        return result[0] || { total_pendente: 0, total_pago_mes: 0, total_vencido: 0 };
    } catch (error) {
        console.error('[SERVICE][GET_CONTAS_PAGAR_SUMMARY]', error);
        throw new Error('Erro ao buscar o resumo financeiro.');
    }
}
