import { callRpc } from '@/lib/api';

export type MeioPagamentoTipo = 'pagamento' | 'recebimento';

export type MeioPagamento = {
  id: string;
  nome: string;
  tipo: MeioPagamentoTipo;
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

