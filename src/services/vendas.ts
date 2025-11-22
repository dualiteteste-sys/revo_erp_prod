import { callRpc } from '@/lib/api';

export type VendaPedido = {
  id: string;
  numero: number;
  cliente_id: string;
  cliente_nome?: string;
  data_emissao: string;
  data_entrega: string | null;
  status: 'orcamento' | 'aprovado' | 'cancelado' | 'concluido';
  total_produtos: number;
  frete: number;
  desconto: number;
  total_geral: number;
  condicao_pagamento: string | null;
  observacoes: string | null;
};

export type VendaItem = {
  id: string;
  pedido_id: string;
  produto_id: string;
  produto_nome?: string;
  sku?: string;
  unidade?: string;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  total: number;
};

export type VendaDetails = VendaPedido & {
  itens: VendaItem[];
};

export type VendaPayload = Partial<Omit<VendaPedido, 'numero' | 'total_produtos' | 'total_geral' | 'cliente_nome'>>;

export async function listVendas(search?: string, status?: string): Promise<VendaPedido[]> {
  return callRpc<VendaPedido[]>('vendas_list_pedidos', {
    p_search: search || null,
    p_status: status || null,
  });
}

export async function getVendaDetails(id: string): Promise<VendaDetails> {
  return callRpc<VendaDetails>('vendas_get_pedido_details', { p_id: id });
}

export async function saveVenda(payload: VendaPayload): Promise<VendaDetails> {
  return callRpc<VendaDetails>('vendas_upsert_pedido', { p_payload: payload });
}

export async function manageVendaItem(
  pedidoId: string,
  itemId: string | null,
  produtoId: string,
  quantidade: number,
  precoUnitario: number,
  desconto: number,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('vendas_manage_item', {
    p_pedido_id: pedidoId,
    p_item_id: itemId,
    p_produto_id: produtoId,
    p_quantidade: quantidade,
    p_preco_unitario: precoUnitario,
    p_desconto: desconto,
    p_action: action,
  });
}

export async function aprovarVenda(id: string): Promise<void> {
  await callRpc('vendas_aprovar_pedido', { p_id: id });
}
