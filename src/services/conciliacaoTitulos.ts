import { callRpc } from '@/lib/api';

export type ConciliacaoTituloTipo = 'pagar' | 'receber';

export type ConciliacaoTituloCandidate = {
  tipo: ConciliacaoTituloTipo;
  titulo_id: string;
  pessoa_id: string;
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

type ConciliacaoAlocacaoItem = { titulo_id: string; valor: number };

type ConciliarExtratoAlocadoResponse =
  | {
      kind: 'ok';
      movimentacao_ids: string[];
      credito_id?: string | null;
      diferenca?: number | null;
      aplicado_total?: number | null;
      extrato_valor?: number | null;
    }
  | {
      kind: 'noop';
      movimentacao_ids: string[];
      message?: string | null;
    };

export async function conciliarExtratoComTitulosAlocados(params: {
  extratoId: string;
  tipo: ConciliacaoTituloTipo;
  alocacoes: Array<{ tituloId: string; valor: number }>;
  overpaymentMode: 'error' | 'credito_em_conta';
  overpaymentPessoaId: string | null;
  observacoes?: string | null;
}): Promise<ConciliarExtratoAlocadoResponse> {
  const alocacoes: ConciliacaoAlocacaoItem[] = (params.alocacoes || []).map((x) => ({
    titulo_id: x.tituloId,
    valor: x.valor,
  }));

  const res = await callRpc<any>('financeiro_conciliacao_conciliar_extrato_com_titulos_alocados', {
    p_extrato_id: params.extratoId,
    p_tipo: params.tipo,
    p_alocacoes: alocacoes,
    p_overpayment_mode: params.overpaymentMode,
    p_overpayment_pessoa_id: params.overpaymentPessoaId,
    p_observacoes: params.observacoes ?? null,
  });

  const kind = String(res?.kind || 'ok') as 'ok' | 'noop';
  const movimentacao_ids = Array.isArray(res?.movimentacao_ids) ? (res.movimentacao_ids as string[]) : [];

  if (kind === 'noop') {
    return { kind: 'noop', movimentacao_ids, message: res?.message ?? null };
  }

  return {
    kind: 'ok',
    movimentacao_ids,
    credito_id: res?.credito_id ?? null,
    diferenca: typeof res?.diferenca === 'number' ? res.diferenca : res?.diferenca != null ? Number(res.diferenca) : null,
    aplicado_total: typeof res?.aplicado_total === 'number' ? res.aplicado_total : res?.aplicado_total != null ? Number(res.aplicado_total) : null,
    extrato_valor: typeof res?.extrato_valor === 'number' ? res.extrato_valor : res?.extrato_valor != null ? Number(res.extrato_valor) : null,
  };
}
