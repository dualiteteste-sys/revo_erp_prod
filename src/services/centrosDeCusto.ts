import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';

export type CentroDeCusto = Database['public']['Tables']['centros_de_custo']['Row'];
export type CentroDeCustoPayload = Partial<CentroDeCusto>;
export type CentroDeCustoListItem = {
    id: string;
    nome: string;
    codigo: string | null;
    status: 'ativo' | 'inativo';
};

export async function listCentrosDeCusto(options: {
    page: number;
    pageSize: number;
    searchTerm: string;
    status: string | null;
    sortBy: { column: string; ascending: boolean };
}): Promise<{ data: CentroDeCustoListItem[]; count: number }> {
    const { page, pageSize, searchTerm, status, sortBy } = options;
    const offset = (page - 1) * pageSize;
    
    try {
        const count = await callRpc<number>('count_centros_de_custo', {
            p_q: searchTerm || null,
            p_status: status as any || null,
        });

        if (Number(count) === 0) {
            return { data: [], count: 0 };
        }

        const data = await callRpc<CentroDeCustoListItem[]>('list_centros_de_custo', {
            p_limit: pageSize,
            p_offset: offset,
            p_q: searchTerm || null,
            p_status: status as any || null,
            p_order_by: sortBy.column,
            p_order_dir: sortBy.ascending ? 'asc' : 'desc',
        });

        return { data: data ?? [], count: Number(count) };
    } catch (error) {
        console.error('[SERVICE][LIST_CENTROS_DE_CUSTO]', error);
        throw new Error('Não foi possível listar os centros de custo.');
    }
}

export async function getCentroDeCustoDetails(id: string): Promise<CentroDeCusto> {
    try {
        return await callRpc<CentroDeCusto>('get_centro_de_custo_details', { p_id: id });
    } catch (error) {
        console.error('[SERVICE][GET_CENTRO_DE_CUSTO_DETAILS]', error);
        throw new Error('Erro ao buscar detalhes do centro de custo.');
    }
}

export async function saveCentroDeCusto(payload: CentroDeCustoPayload): Promise<CentroDeCusto> {
    try {
        return await callRpc<CentroDeCusto>('create_update_centro_de_custo', { p_payload: payload });
    } catch (error: any) {
        console.error('[SERVICE][SAVE_CENTRO_DE_CUSTO]', error);
        if (error.message && error.message.includes('uq_centros_de_custo_empresa_nome')) {
            throw new Error('Já existe um centro de custo com este nome.');
        }
        if (error.message && error.message.includes('uq_centros_de_custo_empresa_codigo')) {
            throw new Error('Já existe um centro de custo com este código.');
        }
        throw new Error(error.message || 'Erro ao salvar o centro de custo.');
    }
}

export async function deleteCentroDeCusto(id: string): Promise<void> {
    try {
        await callRpc('delete_centro_de_custo', { p_id: id });
    } catch (error: any) {
        console.error('[SERVICE][DELETE_CENTRO_DE_CUSTO]', error);
        throw new Error(error.message || 'Erro ao excluir o centro de custo.');
    }
}
