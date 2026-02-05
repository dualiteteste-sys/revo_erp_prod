import { callRpc } from '@/lib/api';

export type BarcodeType = 'CODE128' | 'EAN13';

export type ProdutoCodigoBarrasRow = {
  barcode_type: BarcodeType;
  barcode_value: string;
  is_internal: boolean;
  produto_id: string;
  variante_id: string | null;
};

export type ProdutoCodigoBarrasListRow = {
  variante_id: string;
  own_barcode_type: BarcodeType | null;
  own_barcode_value: string | null;
  inherited_barcode_type: BarcodeType | null;
  inherited_barcode_value: string | null;
  effective_barcode_type: BarcodeType | null;
  effective_barcode_value: string | null;
};

export async function getProdutoCodigoBarras(params: {
  produtoId: string;
  varianteId?: string | null;
}): Promise<ProdutoCodigoBarrasRow | null> {
  const rows = await callRpc<ProdutoCodigoBarrasRow[]>('produtos_codigo_barras_get_for_current_user', {
    p_produto_id: params.produtoId,
    p_variante_id: params.varianteId ?? null,
  });
  return rows?.[0] ?? null;
}

export async function listProdutoCodigosBarras(params: { produtoPaiId: string }): Promise<ProdutoCodigoBarrasListRow[]> {
  return callRpc<ProdutoCodigoBarrasListRow[]>('produtos_codigo_barras_list_for_current_user', {
    p_produto_pai_id: params.produtoPaiId,
  });
}

export async function upsertProdutoCodigoBarras(params: {
  produtoId: string;
  varianteId?: string | null;
  barcodeType: BarcodeType;
  barcodeValue: string;
}): Promise<void> {
  await callRpc('produtos_codigo_barras_upsert_for_current_user', {
    p_produto_id: params.produtoId,
    p_variante_id: params.varianteId ?? null,
    p_barcode_type: params.barcodeType,
    p_barcode_value: params.barcodeValue,
  });
}

export async function clearProdutoCodigoBarras(params: { produtoId: string; varianteId?: string | null }): Promise<void> {
  await callRpc('produtos_codigo_barras_clear_for_current_user', {
    p_produto_id: params.produtoId,
    p_variante_id: params.varianteId ?? null,
  });
}

export async function generateProdutoCodigoBarrasInterno(params: {
  produtoId: string;
  varianteId?: string | null;
}): Promise<ProdutoCodigoBarrasRow> {
  return callRpc<ProdutoCodigoBarrasRow>('produtos_codigo_barras_generate_internal_for_current_user', {
    p_produto_id: params.produtoId,
    p_variante_id: params.varianteId ?? null,
  });
}

