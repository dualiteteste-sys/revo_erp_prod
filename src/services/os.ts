import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';

// --- Placeholder Types for missing DB schema ---
export type status_os = "orcamento" | "aberta" | "concluida" | "cancelada";

export type OrdemServico = {
  id: string;
  empresa_id: string;
  numero: number | string;
  cliente_id: string | null;
  descricao: string | null;
  status: status_os;
  data_inicio: string | null;
  data_prevista: string | null;
  hora: string | null;
  total_itens: number;
  desconto_valor: number;
  total_geral: number;
  forma_recebimento: string | null;
  condicao_pagamento: string | null;
  observacoes: string | null;
  observacoes_internas: string | null;
  created_at: string;
  updated_at: string;
  ordem: number | null;
  cliente_nome: string | null;
};

export type OrdemServicoItem = {
    id: string;
    ordem_servico_id: string;
    empresa_id: string;
    servico_id: string | null;
    produto_id: string | null;
    descricao: string;
    codigo: string | null;
    quantidade: number;
    preco: number;
    desconto_pct: number;
    total: number;
    orcar: boolean;
    created_at: string;
    updated_at: string;
};
// --- End Placeholder Types ---


export type OrdemServicoDetails = OrdemServico & {
  itens: OrdemServicoItem[];
};

export type OrdemServicoPayload = Partial<OrdemServico>;
export type OrdemServicoItemPayload = Partial<OrdemServicoItem>;

export type OsItemSearchResult = {
  id: string;
  type: 'product' | 'service';
  descricao: string;
  codigo: string | null;
  preco_venda: number | null;
};

export type KanbanOs = {
    id: string;
    numero: bigint;
    descricao: string;
    status: status_os;
    data_prevista: string | null;
    cliente_nome: string | null;
};

// --- OS Header Functions ---

export async function listOs(params: {
  search?: string | null;
  status?: status_os[] | null;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}) {
  const p = {
    p_search: params.search ?? null,
    p_status: params.status ?? null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_order_by: params.orderBy ?? 'ordem',
    p_order_dir: params.orderDir ?? 'asc',
  };
  return callRpc<OrdemServico[]>('list_os_for_current_user', p);
}

export async function getOs(id: string): Promise<OrdemServico> {
  const data = await callRpc<OrdemServico>('get_os_by_id_for_current_user', { p_id: id });
  if (!data || !data.id) {
    throw new Error('Ordem de Serviço não encontrada.');
  }
  return data;
}

export async function deleteOs(id: string): Promise<void> {
  return callRpc('delete_os_for_current_user', { p_id: id });
}

export async function updateOsOrder(osIds: string[]): Promise<void> {
    return callRpc('update_os_order', { p_os_ids: osIds });
}


// --- OS Items Functions ---

export async function listOSItems(osId: string): Promise<OrdemServicoItem[]> {
  return callRpc<OrdemServicoItem[]>('list_os_items_for_current_user', { p_os_id: osId });
}

type AddItemPayload = {
  produto_id?: string;
  servico_id?: string;
  quantidade?: number;
  qtd?: number;
  desconto_pct?: number;
  desconto?: number;
  orcar?: boolean;
};

export async function addOsItem(osId: string, payload: AddItemPayload): Promise<OrdemServicoItem> {
  console.log('[RPC] add_os_item_for_current_user -> (p_os_id, payload)', { osId, payload });
  return callRpc<OrdemServicoItem>('add_os_item_for_current_user', {
    p_os_id: osId,
    payload,
  });
}

export async function deleteOsItem(itemId: string) {
  return callRpc<void>("delete_os_item_for_current_user", { p_item_id: itemId });
}

// --- Autocomplete Functions ---

export async function searchItemsForOs(q: string, limit = 20): Promise<OsItemSearchResult[]> {
    return callRpc<OsItemSearchResult[]>('search_items_for_os', { p_search: q, p_limit: limit });
}

// --- Composite Functions ---

export async function getOsDetails(id: string): Promise<OrdemServicoDetails> {
  const osHeader = await getOs(id);
  const osItems = await listOSItems(id);
  return { ...osHeader, itens: osItems };
}

export async function saveOs(osData: Partial<OrdemServicoDetails>): Promise<OrdemServicoDetails> {
  const saved: OrdemServico = osData.id
    ? await callRpc<OrdemServico>('update_os_for_current_user', { p_id: osData.id, payload: osData })
    : await callRpc<OrdemServico>('create_os_for_current_user', { payload: osData });

  if (!saved?.id) {
    throw new Error('A operação no banco de dados não retornou uma O.S. válida.');
  }
  return getOsDetails(saved.id);
}

export async function seedDefaultOs(): Promise<OrdemServico[]> {
    console.log('[RPC] seed_os_for_current_user');
    return callRpc<OrdemServico[]>('seed_os_for_current_user', { p_count: 20 });
}

// --- Kanban Functions ---

export async function listKanbanOs(): Promise<KanbanOs[]> {
    return callRpc<KanbanOs[]>('list_kanban_os');
}

export async function updateOsDataPrevista(osId: string, newDate: string | null): Promise<void> {
    return callRpc('update_os_data_prevista', { p_os_id: osId, p_new_date: newDate });
}
