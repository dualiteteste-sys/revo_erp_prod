import { callRpc } from '@/lib/api';

export type FaixaPrecoRow = {
  id: string;
  min_qtd: number;
  max_qtd: number | null;
  preco_unitario: number;
  created_at: string;
  updated_at: string;
};

export async function listFaixasPreco(params: { produtoId: string; tabelaPrecoId: string }): Promise<FaixaPrecoRow[]> {
  return callRpc<FaixaPrecoRow[]>('tabelas_preco_faixas_list_for_current_user', {
    p_produto_id: params.produtoId,
    p_tabela_preco_id: params.tabelaPrecoId,
  });
}

export async function upsertFaixaPreco(params: {
  id?: string | null;
  produtoId: string;
  tabelaPrecoId: string;
  minQtd: number;
  maxQtd?: number | null;
  precoUnitario: number;
}): Promise<string> {
  return callRpc<string>('tabelas_preco_faixas_upsert_for_current_user', {
    p_payload: {
      id: params.id ?? null,
      produto_id: params.produtoId,
      tabela_preco_id: params.tabelaPrecoId,
      min_qtd: params.minQtd,
      max_qtd: params.maxQtd ?? null,
      preco_unitario: params.precoUnitario,
    },
  });
}

export async function deleteFaixaPreco(id: string): Promise<void> {
  return callRpc<void>('tabelas_preco_faixas_delete_for_current_user', { p_id: id });
}

