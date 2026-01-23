import { callRpc } from '@/lib/api';

export type AtributoRow = {
  id: string;
  nome: string;
  tipo: string;
  created_at: string;
  updated_at: string;
};

export type VariantRow = {
  id: string;
  nome: string;
  sku: string | null;
  status: string;
  unidade: string;
  preco_venda: number;
  created_at: string;
  updated_at: string;
};

export type GeneratedVariantRow = {
  variant_id: string;
  variant_nome: string;
  variant_sku: string | null;
};

export async function listAtributos(params?: { q?: string | null }): Promise<AtributoRow[]> {
  return callRpc<AtributoRow[]>('atributos_list_for_current_user', { p_q: params?.q ?? null });
}

export async function ensureAtributo(params: { nome: string; tipo?: string }): Promise<string> {
  return callRpc<string>('atributos_ensure', { p_nome: params.nome, p_tipo: params.tipo ?? 'text' });
}

export async function listVariantes(produtoPaiId: string): Promise<VariantRow[]> {
  return callRpc<VariantRow[]>('produtos_variantes_list_for_current_user', { p_produto_pai_id: produtoPaiId });
}

export async function generateVariantes(params: {
  produtoPaiId: string;
  atributoId: string;
  valores: string[];
  skuSuffixMode?: 'slug' | 'num';
}): Promise<GeneratedVariantRow[]> {
  return callRpc<GeneratedVariantRow[]>('produtos_variantes_generate_for_current_user', {
    p_produto_pai_id: params.produtoPaiId,
    p_atributo_id: params.atributoId,
    p_valores_text: params.valores,
    p_sku_suffix_mode: params.skuSuffixMode ?? 'slug',
  });
}

