import { callRpc } from '@/lib/api';

export type InventarioCiclicoStatus = 'rascunho' | 'em_contagem' | 'aprovado' | 'cancelado';

export type InventarioCiclicoListRow = {
  id: string;
  nome: string;
  status: InventarioCiclicoStatus;
  created_at: string;
  updated_at: string;
  itens_total: number;
  itens_contados: number;
  divergencias: number;
};

export type InventarioCiclicoHeader = {
  id: string;
  nome: string;
  status: InventarioCiclicoStatus;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

export type InventarioCiclicoItem = {
  id: string;
  produto_id: string;
  produto_nome: string;
  sku: string | null;
  unidade: string;
  saldo_sistema: number;
  quantidade_contada: number | null;
  divergencia: number;
  status: 'pendente' | 'contado' | 'ajustado';
  updated_at: string;
};

export type InventarioCiclicoGetResponse = {
  header: InventarioCiclicoHeader;
  items: InventarioCiclicoItem[];
};

export async function listInventariosCiclicos(params?: {
  status?: InventarioCiclicoStatus[];
  limit?: number;
  offset?: number;
}): Promise<InventarioCiclicoListRow[]> {
  return callRpc<InventarioCiclicoListRow[]>('suprimentos_inventarios_list', {
    p_status: params?.status ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  });
}

export async function createInventarioCiclico(opts: { nome: string; produtoIds?: string[] | null }): Promise<string> {
  return callRpc<string>('suprimentos_inventario_create', {
    p_nome: opts.nome,
    p_produto_ids: opts.produtoIds ?? null,
  });
}

export async function getInventarioCiclico(id: string): Promise<InventarioCiclicoGetResponse> {
  const result = await callRpc<any>('suprimentos_inventario_get', { p_id: id });
  return result as InventarioCiclicoGetResponse;
}

export async function setInventarioCiclicoCount(opts: {
  inventarioId: string;
  produtoId: string;
  quantidadeContada: number | null;
}): Promise<void> {
  await callRpc('suprimentos_inventario_set_count', {
    p_inventario_id: opts.inventarioId,
    p_produto_id: opts.produtoId,
    p_quantidade_contada: opts.quantidadeContada,
  });
}

export async function aprovarInventarioCiclico(inventarioId: string): Promise<{
  inventario_id: string;
  itens_total: number;
  itens_contados: number;
  ajustes: number;
}> {
  return callRpc('suprimentos_inventario_aprovar', { p_id: inventarioId });
}

