import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';

export type TipoCentroCusto = 'receita' | 'despesa' | 'investimento' | 'outro';

export type CentroDeCusto = {
    id: string;
    empresa_id: string;
    parent_id: string | null;
    codigo: string | null;
    nome: string;
    tipo: TipoCentroCusto;
    nivel: number;
    ordem: number;
    ativo: boolean;
    observacoes: string | null;
    created_at: string;
    updated_at: string;
    // Campos virtuais retornados pelo GET details
    parent_nome?: string;
    has_children?: boolean;
};

export type CentroDeCustoPayload = Partial<Omit<CentroDeCusto, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'parent_nome' | 'has_children'>> & {
    id?: string;
};

export type CentroDeCustoListItem = {
    id: string;
    parent_id: string | null;
    codigo: string | null;
    nome: string;
    tipo: TipoCentroCusto;
    nivel: number;
    ordem: number;
    ativo: boolean;
    observacoes: string | null;
    total_count: number;
};

export async function listCentrosDeCusto(options: {
    page: number;
    pageSize: number;
    searchTerm: string;
    status: string | null; // 'ativo' | 'inativo' | null from UI filter
    sortBy?: { column: string; ascending: boolean };
}): Promise<{ data: CentroDeCustoListItem[]; count: number }> {
    const { page, pageSize, searchTerm, status } = options;
    const offset = (page - 1) * pageSize;
    
    // Map UI status string to boolean
    let ativo: boolean | null = null;
    if (status === 'ativo') ativo = true;
    if (status === 'inativo') ativo = false;

    try {
        const data = await callRpc<CentroDeCustoListItem[]>('financeiro_centros_custos_list', {
            p_limit: pageSize,
            p_offset: offset,
            p_search: searchTerm || null,
            p_ativo: ativo,
            p_tipo: null, 
        });

        if (!data || data.length === 0) {
            return { data: [], count: 0 };
        }

        const count = Number(data[0].total_count);
        return { data, count };
    } catch (error) {
        console.error('[SERVICE][LIST_CENTROS_DE_CUSTO]', error);
        throw new Error('Não foi possível listar os centros de custo.');
    }
}

export async function getCentroDeCustoDetails(id: string): Promise<CentroDeCusto> {
    try {
        return await callRpc<CentroDeCusto>('financeiro_centros_custos_get', { p_id: id });
    } catch (error) {
        console.error('[SERVICE][GET_CENTRO_DE_CUSTO_DETAILS]', error);
        throw new Error('Erro ao buscar detalhes do centro de custo.');
    }
}

export async function saveCentroDeCusto(payload: CentroDeCustoPayload): Promise<CentroDeCusto> {
    try {
        return await callRpc<CentroDeCusto>('financeiro_centros_custos_upsert', { p_payload: payload });
    } catch (error: any) {
        console.error('[SERVICE][SAVE_CENTRO_DE_CUSTO]', error);
        if (error.message && error.message.includes('fin_ccustos_empresa_codigo_uk')) {
            throw new Error('Já existe um centro de custo com este código.');
        }
        if (error.message && error.message.includes('fin_ccustos_empresa_nome_parent_uk')) {
            throw new Error('Já existe um centro de custo com este nome neste nível.');
        }
        throw new Error(error.message || 'Erro ao salvar o centro de custo.');
    }
}

export async function deleteCentroDeCusto(id: string): Promise<void> {
    try {
        await callRpc('financeiro_centros_custos_delete', { p_id: id });
    } catch (error: any) {
        console.error('[SERVICE][DELETE_CENTRO_DE_CUSTO]', error);
        throw new Error(error.message || 'Erro ao excluir o centro de custo.');
    }
}

export async function searchCentrosDeCusto(query: string): Promise<CentroDeCustoListItem[]> {
    try {
        const { data } = await listCentrosDeCusto({
            page: 1,
            pageSize: 20,
            searchTerm: query,
            status: 'ativo',
        });
        return data;
    } catch (error) {
        console.error('[SERVICE][SEARCH_CENTROS]', error);
        return [];
    }
}

export async function seedCentrosDeCusto(): Promise<void> {
  const promises = Array.from({ length: 5 }).map(() => {
    const payload: CentroDeCustoPayload = {
      nome: faker.commerce.department(),
      codigo: faker.string.numeric(3),
      tipo: faker.helpers.arrayElement(['receita', 'despesa', 'investimento']),
      ativo: true,
      observacoes: faker.lorem.sentence(),
    };
    return saveCentroDeCusto(payload);
  });
  await Promise.all(promises);
}
