import { callRpc } from '@/lib/api';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ConciliacaoTitulo = {
  id: string;
  descricao: string;
  cliente_nome: string | null;
  fornecedor_nome: string | null;
  documento_ref: string | null;
  data_vencimento: string;
  valor: number;
  valor_pago: number | null;
  saldo: number | null;
  status: string;
  forma_pagamento: string | null;
  origem_tipo: string | null;
  data_pagamento: string | null;
};

export type ConciliacaoGroup = {
  data_vencimento: string;
  total_titulos: number;
  total_valor: number;
  total_pago: number;
  titulos: ConciliacaoTitulo[];
};

export type ConciliacaoSummaryReceber = {
  total_a_receber: number;
  total_vencido: number;
  total_recebido: number;
};

export type ConciliacaoSummaryPagar = {
  total_a_pagar: number;
  total_vencido: number;
  total_pago: number;
};

export type ConciliacaoResult<S = ConciliacaoSummaryReceber | ConciliacaoSummaryPagar> = {
  summary: S;
  groups: ConciliacaoGroup[];
};

// ---------------------------------------------------------------------------
// Contas a Receber
// ---------------------------------------------------------------------------

export async function fetchConciliacaoCartaoReceber(params: {
  formaPagamento?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<ConciliacaoResult<ConciliacaoSummaryReceber>> {
  return callRpc<ConciliacaoResult<ConciliacaoSummaryReceber>>('financeiro_contas_a_receber_conciliacao_list', {
    p_forma_pagamento: params.formaPagamento ?? 'Cartão de crédito',
    p_status: params.status ?? 'pendentes',
    p_start_date: params.startDate ?? null,
    p_end_date: params.endDate ?? null,
  });
}

/** @deprecated Use fetchConciliacaoCartaoReceber instead */
export const fetchConciliacaoCartao = fetchConciliacaoCartaoReceber;

// ---------------------------------------------------------------------------
// Contas a Pagar
// ---------------------------------------------------------------------------

export async function fetchConciliacaoCartaoPagar(params: {
  formaPagamento?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<ConciliacaoResult<ConciliacaoSummaryPagar>> {
  return callRpc<ConciliacaoResult<ConciliacaoSummaryPagar>>('financeiro_contas_pagar_conciliacao_list', {
    p_forma_pagamento: params.formaPagamento ?? 'Cartão de crédito',
    p_status: params.status ?? 'pendentes',
    p_start_date: params.startDate ?? null,
    p_end_date: params.endDate ?? null,
  });
}
