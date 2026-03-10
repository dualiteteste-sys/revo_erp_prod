import { callRpc } from '@/lib/api';

export type ConciliacaoTitulo = {
  id: string;
  descricao: string;
  cliente_nome: string | null;
  data_vencimento: string;
  valor: number;
  status: string;
  forma_pagamento: string | null;
  origem_tipo: string | null;
  data_pagamento: string | null;
  valor_pago: number | null;
};

export type ConciliacaoGroup = {
  data_vencimento: string;
  total_titulos: number;
  total_valor: number;
  total_pago: number;
  titulos: ConciliacaoTitulo[];
};

export type ConciliacaoSummary = {
  total_a_receber: number;
  total_vencido: number;
  total_recebido: number;
};

export type ConciliacaoResult = {
  summary: ConciliacaoSummary;
  groups: ConciliacaoGroup[];
};

export async function fetchConciliacaoCartao(params: {
  formaPagamento?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<ConciliacaoResult> {
  return callRpc<ConciliacaoResult>('financeiro_contas_a_receber_conciliacao_list', {
    p_forma_pagamento: params.formaPagamento ?? 'Cartão de crédito',
    p_status: params.status ?? 'pendentes',
    p_start_date: params.startDate ?? null,
    p_end_date: params.endDate ?? null,
  });
}
