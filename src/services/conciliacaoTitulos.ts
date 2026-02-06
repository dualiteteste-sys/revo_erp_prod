import { callRpc } from '@/lib/api';

export type ConciliacaoTituloTipo = 'pagar' | 'receber';

export type ConciliacaoTituloCandidate = {
  tipo: ConciliacaoTituloTipo;
  titulo_id: string;
  pessoa_nome: string;
  descricao: string | null;
  documento_ref: string | null;
  data_vencimento: string;
  valor_total: number;
  valor_pago: number;
  saldo_aberto: number;
  status: string;
  score?: number;
  total_count?: number;
};

export async function sugerirTitulosParaExtrato(extratoId: string, limit = 10): Promise<ConciliacaoTituloCandidate[]> {
  const rows = await callRpc<ConciliacaoTituloCandidate[]>('financeiro_conciliacao_titulos_sugerir', {
    p_extrato_id: extratoId,
    p_limit: limit,
  });
  return rows ?? [];
}

export async function searchTitulosParaConciliacao(params: {
  tipo: ConciliacaoTituloTipo;
  valor?: number | null;
  startDate?: string | null; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  q?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ data: ConciliacaoTituloCandidate[]; count: number }> {
  const rows = await callRpc<ConciliacaoTituloCandidate[]>('financeiro_conciliacao_titulos_search', {
    p_tipo: params.tipo,
    p_valor: params.valor ?? null,
    p_start_date: params.startDate ?? null,
    p_end_date: params.endDate ?? null,
    p_q: params.q ?? null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
  const data = rows ?? [];
  const count = data.length > 0 ? Number(data[0].total_count ?? data.length) : 0;
  return { data, count };
}

export async function conciliarExtratoComTitulo(params: {
  extratoId: string;
  tipo: ConciliacaoTituloTipo;
  tituloId: string;
}): Promise<{ movimentacaoId: string }> {
  const movimentacaoId = await callRpc<string>('financeiro_conciliacao_conciliar_extrato_com_titulo', {
    p_extrato_id: params.extratoId,
    p_tipo: params.tipo,
    p_titulo_id: params.tituloId,
  });
  return { movimentacaoId };
}

export async function conciliarExtratoComTituloParcial(params: {
  extratoId: string;
  tipo: ConciliacaoTituloTipo;
  tituloId: string;
}): Promise<{ movimentacaoId: string }> {
  const movimentacaoId = await callRpc<string>('financeiro_conciliacao_conciliar_extrato_com_titulo_parcial', {
    p_extrato_id: params.extratoId,
    p_tipo: params.tipo,
    p_titulo_id: params.tituloId,
  });
  return { movimentacaoId };
}

export async function conciliarExtratoComTitulosLote(params: {
  extratoId: string;
  tipo: ConciliacaoTituloTipo;
  tituloIds: string[];
}): Promise<{ movimentacaoId: string }> {
  const movimentacaoId = await callRpc<string>('financeiro_conciliacao_conciliar_extrato_com_titulos', {
    p_extrato_id: params.extratoId,
    p_tipo: params.tipo,
    p_titulo_ids: params.tituloIds,
  });
  return { movimentacaoId };
}
