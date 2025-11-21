import { callRpc } from '@/lib/api';

export type SalesGoal = {
  id: string;
  empresa_id: string;
  vendedor_id: string;
  vendedor_nome: string;
  data_inicio: string;
  data_fim: string;
  valor_meta: number;
  valor_realizado: number;
  atingimento: number;
  status: 'nao_iniciada' | 'em_andamento' | 'concluida' | 'cancelada';
  created_at: string;
  updated_at: string;
};

export type SalesGoalPayload = Partial<Omit<SalesGoal, 'vendedor_nome' | 'atingimento' | 'status' | 'valor_realizado'>>;

export async function listSalesGoals(options: {
  page: number;
  pageSize: number;
  searchTerm: string;
  status: string | null;
  sortBy: { column: string; ascending: boolean };
}): Promise<{ data: SalesGoal[]; count: number }> {
    const { page, pageSize, searchTerm, status, sortBy } = options;
    const offset = (page - 1) * pageSize;

    const count = await callRpc<number>('count_metas_vendas', {
        p_q: searchTerm || null,
        p_status: status || null,
    });

    if (Number(count) === 0) {
        return { data: [], count: 0 };
    }

    const data = await callRpc<SalesGoal[]>('list_metas_vendas', {
        p_limit: pageSize,
        p_offset: offset,
        p_q: searchTerm || null,
        p_status: status || null,
        p_order_by: sortBy.column,
        p_order_dir: sortBy.ascending ? 'asc' : 'desc',
    });

    return { data: data ?? [], count: Number(count) };
}

export async function getSalesGoalDetails(id: string): Promise<SalesGoal> {
    return callRpc<SalesGoal>('get_meta_venda_details', { p_id: id });
}

export async function saveSalesGoal(payload: SalesGoalPayload): Promise<SalesGoal> {
    return callRpc<SalesGoal>('create_update_meta_venda', { p_payload: payload });
}

export async function deleteSalesGoal(id: string): Promise<void> {
    return callRpc('delete_meta_venda', { p_id: id });
}
