import { callRpc } from '@/lib/api';

export type CompraPedido = {
  id: string;
  numero: number;
  fornecedor_id: string;
  fornecedor_nome?: string;
  data_emissao: string;
  data_prevista: string | null;
  data_recebimento?: string | null;
  status: 'rascunho' | 'enviado' | 'recebido' | 'cancelado';
  total_produtos: number;
  frete: number;
  desconto: number;
  total_geral: number;
  observacoes: string | null;
  created_at?: string;
  updated_at?: string;
  total_count?: number;
};

export type CompraItem = {
  id: string;
  pedido_id: string;
  produto_id: string;
  produto_nome?: string;
  unidade?: string;
  quantidade: number;
  preco_unitario: number;
  total: number;
};

export type CompraDetails = CompraPedido & {
  itens: CompraItem[];
};

export type CompraPayload = Partial<Omit<CompraPedido, 'numero' | 'total_produtos' | 'total_geral' | 'fornecedor_nome'>>;

export async function listCompras(params: {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<CompraPedido[]> {
  return callRpc<CompraPedido[]>('compras_list_pedidos', {
    p_search: params.search || null,
    p_status: params.status || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
}

export async function getCompraDetails(id: string): Promise<CompraDetails> {
  return callRpc<CompraDetails>('compras_get_pedido_details', { p_id: id });
}

export async function saveCompra(payload: CompraPayload): Promise<CompraDetails> {
  return callRpc<CompraDetails>('compras_upsert_pedido', { p_payload: payload });
}

export async function manageCompraItem(
  pedidoId: string,
  itemId: string | null,
  produtoId: string,
  quantidade: number,
  precoUnitario: number,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('compras_manage_item', {
    p_pedido_id: pedidoId,
    p_item_id: itemId,
    p_produto_id: produtoId,
    p_quantidade: quantidade,
    p_preco_unitario: precoUnitario,
    p_action: action,
  });
}

export async function receberCompra(id: string): Promise<void> {
  await callRpc('compras_receber_pedido', { p_id: id });
}

export type SupplierHit = { id: string; label: string; nome: string; doc_unico: string | null };

export async function searchSuppliers(q: string): Promise<SupplierHit[]> {
  return callRpc<SupplierHit[]>('search_suppliers_for_current_user', { p_search: q });
}
