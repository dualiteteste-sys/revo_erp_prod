import { callRpc } from '@/lib/api';

export type MeioPagamentoTipo = 'pagamento' | 'recebimento';

export type MeioPagamento = {
  id: string;
  nome: string;
  tipo: MeioPagamentoTipo;
};

export type MeioPagamentoAdminRow = MeioPagamento & {
  ativo: boolean;
  is_system: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function searchMeiosPagamento(params: {
  tipo: MeioPagamentoTipo;
  q: string | null;
  limit?: number;
}): Promise<MeioPagamento[]> {
  return callRpc<MeioPagamento[]>('financeiro_meios_pagamento_search', {
    p_tipo: params.tipo,
    p_q: params.q ?? null,
    p_limit: params.limit ?? 20,
  });
}

export async function upsertMeioPagamento(payload: { id?: string | null; tipo: MeioPagamentoTipo; nome: string; ativo?: boolean }): Promise<MeioPagamento> {
  return callRpc<any>('financeiro_meios_pagamento_upsert', {
    p_payload: {
      id: payload.id ?? null,
      tipo: payload.tipo,
      nome: payload.nome,
      ativo: payload.ativo ?? true,
    },
  });
}

export async function listMeiosPagamentoAdmin(params: {
  tipo: MeioPagamentoTipo;
  q?: string | null;
  status?: 'all' | 'ativo' | 'inativo';
  limit?: number;
}): Promise<MeioPagamentoAdminRow[]> {
  return callRpc<MeioPagamentoAdminRow[]>('financeiro_meios_pagamento_list', {
    p_tipo: params.tipo,
    p_q: params.q ?? null,
    p_status: params.status ?? 'all',
    p_limit: params.limit ?? 200,
  });
}

export async function setMeioPagamentoAtivo(params: {
  id: string;
  tipo: MeioPagamentoTipo;
  ativo: boolean;
}): Promise<MeioPagamentoAdminRow> {
  return callRpc<any>('financeiro_meios_pagamento_set_ativo', {
    p_id: params.id,
    p_tipo: params.tipo,
    p_ativo: params.ativo,
  });
}

export async function bulkUpsertMeiosPagamento(params: {
  tipo: MeioPagamentoTipo;
  nomes: string[];
  ativo: boolean;
  limit?: number;
}): Promise<{ ok: boolean; tipo: string; ativo: boolean; total: number; inserted: number; updated: number }> {
  return callRpc<any>('financeiro_meios_pagamento_bulk_upsert', {
    p_payload: {
      tipo: params.tipo,
      ativo: params.ativo,
      nomes: params.nomes,
      limit: params.limit ?? 500,
    },
  });
}

export async function deleteMeioPagamento(params: { id: string; tipo: MeioPagamentoTipo }): Promise<{ ok: boolean; id: string }> {
  return callRpc<any>('financeiro_meios_pagamento_delete', {
    p_id: params.id,
    p_tipo: params.tipo,
  });
}
