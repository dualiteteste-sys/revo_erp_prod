import { supabase } from '@/lib/supabaseClient';

export interface ProdutoAnuncio {
  id: string;
  ecommerce_id: string;
  ecommerce_nome: string;
  ecommerce_provider: string;
  identificador: string;
  titulo: string | null;
  descricao: string | null;
  descricao_complementar: string | null;
  preco_especifico: number | null;
  status_anuncio: string;
  identificador_externo: string | null;
  url_anuncio: string | null;
  categoria_marketplace: string | null;
  sync_status: string;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface ProdutoAnuncioPayload {
  id?: string;
  produto_id?: string;
  ecommerce_id?: string;
  identificador?: string;
  titulo?: string | null;
  descricao?: string | null;
  descricao_complementar?: string | null;
  preco_especifico?: number | null;
  status_anuncio?: string;
  identificador_externo?: string | null;
  url_anuncio?: string | null;
  categoria_marketplace?: string | null;
}

export async function listProdutoAnunciosForProduct(produtoId: string): Promise<ProdutoAnuncio[]> {
  // @ts-ignore
  const { data, error } = await supabase.rpc('list_produto_anuncios_for_product', {
    p_produto_id: produtoId,
  });

  if (error) throw error;
  return data || [];
}

export async function upsertProdutoAnuncio(payload: ProdutoAnuncioPayload): Promise<ProdutoAnuncio> {
  // @ts-ignore
  const { data, error } = await supabase.rpc('upsert_produto_anuncio', {
    p_payload: payload,
  });

  if (error) throw error;
  return data;
}

export async function deleteProdutoAnuncio(id: string): Promise<void> {
  // @ts-ignore
  const { error } = await supabase.rpc('delete_produto_anuncio', {
    p_id: id,
  });

  if (error) throw error;
}
