import { callRpc } from '@/lib/api';

export type ProductParentRow = {
  id: string;
  nome: string | null;
  sku: string | null;
  slug: string | null;
  status: 'ativo' | 'inativo' | null;
  preco_venda: number | null;
  unidade: string | null;
  created_at: string | null;
  updated_at: string | null;
  children_count: number | null;
};

export type ProductVariantRow = {
  id: string;
  nome: string | null;
  sku: string | null;
  status: 'ativo' | 'inativo' | null;
  unidade: string | null;
  preco_venda: number | null;
  created_at: string | null;
  updated_at: string | null;
  atributos_summary: string | null;
};

export async function getProductParents(options: {
  page: number;
  pageSize: number;
  searchTerm: string;
  status: 'ativo' | 'inativo' | null;
  sortBy: { column: 'nome' | 'created_at'; ascending: boolean };
}): Promise<{ data: ProductParentRow[]; count: number }> {
  const { page, pageSize, searchTerm, status, sortBy } = options;
  const offset = (page - 1) * pageSize;
  const orderString = `${sortBy.column} ${sortBy.ascending ? 'asc' : 'desc'}`;

  const count = await callRpc<number>('produtos_parents_count_for_current_user', {
    p_q: searchTerm || null,
    p_status: status,
  });

  if (Number(count) === 0) return { data: [], count: 0 };

  const data = await callRpc<ProductParentRow[]>('produtos_parents_list_for_current_user', {
    p_limit: pageSize,
    p_offset: offset,
    p_q: searchTerm || null,
    p_status: status,
    p_order: orderString,
  });

  return { data: data ?? [], count: Number(count) };
}

export async function listVariantsForParent(parentId: string): Promise<ProductVariantRow[]> {
  return callRpc<ProductVariantRow[]>('produtos_variantes_list_for_current_user', { p_produto_pai_id: parentId });
}

