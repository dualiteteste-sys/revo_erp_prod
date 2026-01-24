import { callRpc } from '@/lib/api';

export type CondicaoPagamentoTipo = 'pagar' | 'receber' | 'ambos';

export type CondicaoPagamento = {
  id: string;
  nome: string;
  condicao: string;
  tipo: CondicaoPagamentoTipo;
};

export type CondicaoPagamentoAdminRow = CondicaoPagamento & {
  ativo: boolean;
  is_system: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function searchCondicoesPagamento(params: {
  tipo: CondicaoPagamentoTipo;
  q: string | null;
  limit?: number;
}): Promise<CondicaoPagamento[]> {
  return callRpc<CondicaoPagamento[]>('financeiro_condicoes_pagamento_search', {
    p_tipo: params.tipo,
    p_q: params.q ?? null,
    p_limit: params.limit ?? 20,
  });
}

export async function listCondicoesPagamentoAdmin(params: {
  tipo: CondicaoPagamentoTipo;
  q?: string | null;
  status?: 'all' | 'ativo' | 'inativo';
  limit?: number;
}): Promise<CondicaoPagamentoAdminRow[]> {
  return callRpc<CondicaoPagamentoAdminRow[]>('financeiro_condicoes_pagamento_list', {
    p_tipo: params.tipo,
    p_q: params.q ?? null,
    p_status: params.status ?? 'all',
    p_limit: params.limit ?? 200,
  });
}

export async function upsertCondicaoPagamento(payload: {
  id?: string | null;
  tipo: CondicaoPagamentoTipo;
  nome: string;
  condicao: string;
  ativo?: boolean;
}): Promise<CondicaoPagamentoAdminRow> {
  return callRpc<any>('financeiro_condicoes_pagamento_upsert', {
    p_payload: {
      id: payload.id ?? null,
      tipo: payload.tipo,
      nome: payload.nome,
      condicao: payload.condicao,
      ativo: payload.ativo ?? true,
    },
  });
}

export async function setCondicaoPagamentoAtivo(params: {
  id: string;
  tipo: CondicaoPagamentoTipo;
  ativo: boolean;
}): Promise<CondicaoPagamentoAdminRow> {
  return callRpc<any>('financeiro_condicoes_pagamento_set_ativo', {
    p_id: params.id,
    p_tipo: params.tipo,
    p_ativo: params.ativo,
  });
}

export async function deleteCondicaoPagamento(params: { id: string; tipo: CondicaoPagamentoTipo }): Promise<{ ok: boolean; id: string }> {
  return callRpc<any>('financeiro_condicoes_pagamento_delete', {
    p_id: params.id,
    p_tipo: params.tipo,
  });
}

