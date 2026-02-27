import { callRpc } from '@/lib/api';

export type CategoriaMovimentacao = {
  id: string;
  nome: string;
  tipo: 'entrada' | 'saida' | 'ambos';
  dre_linha_key: string | null;
  is_system: boolean;
  ativo: boolean;
};

export async function listCategoriasMovimentacao(params?: {
  tipo?: 'entrada' | 'saida' | null;
  ativo?: boolean;
}): Promise<CategoriaMovimentacao[]> {
  const rows = await callRpc<CategoriaMovimentacao[]>('financeiro_categorias_mov_list', {
    p_tipo: params?.tipo ?? null,
    p_ativo: params?.ativo ?? true,
  });
  return Array.isArray(rows) ? rows : [];
}
