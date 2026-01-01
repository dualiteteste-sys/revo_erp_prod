import { callRpc } from '@/lib/api';

export type EcommerceProductMappingRow = {
  produto_id: string;
  produto_nome: string;
  produto_sku: string | null;
  anuncio_identificador: string | null;
  ecommerce_id: string;
};

export async function listEcommerceProductMappings(params: {
  provider: 'meli' | 'shopee';
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<EcommerceProductMappingRow[]> {
  return callRpc<EcommerceProductMappingRow[]>('ecommerce_product_mappings_list', {
    p_provider: params.provider,
    p_q: params.q ?? null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
}

export async function upsertEcommerceProductMapping(params: {
  provider: 'meli' | 'shopee';
  produto_id: string;
  identificador: string;
}): Promise<void> {
  await callRpc('ecommerce_product_mapping_upsert', {
    p_provider: params.provider,
    p_produto_id: params.produto_id,
    p_identificador: params.identificador,
  });
}

