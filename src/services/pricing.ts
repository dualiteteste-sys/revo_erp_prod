import { callRpc } from '@/lib/api';

export type TabelaPrecoRow = {
  id: string;
  slug: string;
  nome: string;
  status: 'ativa' | 'inativa' | string;
  created_at: string;
  updated_at: string;
};

export type PricingUnitPrice = {
  preco_unitario: number;
  tabela_preco_id: string;
  fonte: 'faixa' | 'produto' | string;
  faixa_id: string | null;
  min_qtd: number | null;
  max_qtd: number | null;
};

export async function listTabelasPreco(params?: { q?: string | null }): Promise<TabelaPrecoRow[]> {
  return callRpc<TabelaPrecoRow[]>('tabelas_preco_list_for_current_user', {
    p_q: params?.q ?? null,
  });
}

export async function getUnitPrice(params: {
  produtoId: string;
  quantidade: number;
  tabelaPrecoId?: string | null;
  fallbackPrecoUnitario?: number | null;
}): Promise<PricingUnitPrice> {
  try {
    const rows = await callRpc<PricingUnitPrice[]>('pricing_get_unit_price', {
      p_produto_id: params.produtoId,
      p_quantidade: params.quantidade,
      p_tabela_preco_id: params.tabelaPrecoId ?? null,
    });
    const row = rows?.[0];
    if (row) return row;
  } catch {
    // fallback below
  }

  return {
    preco_unitario: Number(params.fallbackPrecoUnitario ?? 0),
    tabela_preco_id: params.tabelaPrecoId ?? '',
    fonte: 'produto',
    faixa_id: null,
    min_qtd: null,
    max_qtd: null,
  };
}
