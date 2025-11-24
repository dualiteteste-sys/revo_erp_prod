import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';
import { getPartners } from './partners';

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

export async function seedSalesGoals(): Promise<void> {
  // Busca parceiros para usar como vendedores
  const { data: partners } = await getPartners({ 
    page: 1, 
    pageSize: 100, 
    searchTerm: '', 
    filterType: null, // Qualquer parceiro pode ser vendedor no seed
    sortBy: { column: 'nome', ascending: true } 
  });
  
  if (partners.length === 0) throw new Error('Crie parceiros/vendedores antes de gerar metas.');

  const promises = Array.from({ length: 5 }).map(() => {
    const vendedor = faker.helpers.arrayElement(partners);
    const startDate = faker.date.recent({ days: 30 });
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const payload: SalesGoalPayload = {
      vendedor_id: vendedor.id,
      data_inicio: startDate.toISOString().split('T')[0],
      data_fim: endDate.toISOString().split('T')[0],
      valor_meta: parseFloat(faker.finance.amount(5000, 50000, 2)),
    };
    return saveSalesGoal(payload);
  });
  await Promise.all(promises);
}
