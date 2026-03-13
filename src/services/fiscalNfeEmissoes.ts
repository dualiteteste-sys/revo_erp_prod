import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

export type AmbienteNfe = 'homologacao' | 'producao';

export type NfeEmissaoRow = {
  id: string;
  status: string;
  numero: number | null;
  serie: number | null;
  chave_acesso: string | null;
  destinatario_pessoa_id: string | null;
  destinatario_nome: string | null;
  ambiente: AmbienteNfe;
  natureza_operacao: string | null;
  natureza_operacao_id: string | null;
  valor_total: number | null;
  total_produtos: number | null;
  total_descontos: number | null;
  total_frete: number | null;
  total_impostos: number | null;
  total_nfe: number | null;
  payload: any;
  last_error: string | null;
  rejection_code: string | null;
  reprocess_count: number;
  created_at: string;
  updated_at: string;
  pedido_origem_id: string | null;
  danfe_url: string | null;
  xml_url: string | null;
};

export type NfeItemRow = {
  id: string;
  produto_id: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_desconto: number;
  ncm: string | null;
  cfop: string | null;
  cst: string | null;
  csosn: string | null;
  ordem: number;
};

export type NfeAuditRow = {
  kind: string;
  occurred_at: string;
  message: string | null;
  payload: any;
  source: string | null;
};

export async function fiscalNfeEmissoesList(
  params: {
    status?: string;
    q?: string;
    limit?: number;
    dataInicio?: string | null;
    dataFim?: string | null;
  } = {},
) {
  return callRpc<NfeEmissaoRow[]>('fiscal_nfe_emissoes_list', {
    p_status: params.status ?? null,
    p_q: params.q ?? null,
    p_limit: params.limit ?? 200,
    p_data_inicio: params.dataInicio ?? null,
    p_data_fim: params.dataFim ?? null,
  });
}

export async function fiscalNfeEmissaoItensList(emissaoId: string) {
  return callRpc<NfeItemRow[]>('fiscal_nfe_emissao_itens_list', { p_emissao_id: emissaoId });
}

export async function fiscalNfeAuditTimelineList(emissaoId: string, params?: { limit?: number }) {
  return callRpc<NfeAuditRow[]>('fiscal_nfe_audit_timeline_list', {
    p_emissao_id: emissaoId,
    p_limit: params?.limit ?? 200,
  });
}

export async function fiscalNfeEmissaoDraftUpsert(input: {
  emissaoId?: string | null;
  destinatarioPessoaId: string;
  ambiente: AmbienteNfe;
  naturezaOperacao: string;
  naturezaOperacaoId?: string;
  totalFrete: number;
  payload: any;
  formaPagamento?: string;
  condicaoPagamentoId?: string;
  transportadoraId?: string;
  modalidadeFrete?: string;
  items: Array<{
    produto_id: string | null;
    descricao: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    valor_desconto: number;
    ncm: string | null;
    cfop: string | null;
    cst: string | null;
    csosn: string | null;
    numero_pedido_cliente?: string | null;
    numero_item_pedido?: number | null;
    informacoes_adicionais?: string | null;
  }>;
}) {
  return callRpc<string>('fiscal_nfe_emissao_draft_upsert', {
    p_emissao_id: input.emissaoId ?? null,
    p_destinatario_pessoa_id: input.destinatarioPessoaId,
    p_ambiente: input.ambiente,
    p_natureza_operacao: input.naturezaOperacao,
    p_total_frete: input.totalFrete,
    p_payload: input.payload ?? {},
    p_items: input.items ?? [],
    p_natureza_operacao_id: input.naturezaOperacaoId ?? null,
    p_forma_pagamento: input.formaPagamento ?? null,
    p_condicao_pagamento_id: input.condicaoPagamentoId ?? null,
    p_transportadora_id: input.transportadoraId ?? null,
    p_modalidade_frete: input.modalidadeFrete ?? '9',
  });
}

export type NfeSubmitResult = {
  ok: boolean;
  status?: string;
  error?: string;
  detail?: string;
  focus_response?: any;
};

export async function fiscalNfeSubmit(emissaoId: string): Promise<NfeSubmitResult> {
  const { data, error } = await supabase.functions.invoke('focusnfe-emit', {
    body: { emissao_id: emissaoId },
  });

  // supabase.functions.invoke returns error for non-2xx responses.
  // The response body is in error.context (a Response object).
  if (error) {
    try {
      const ctx = (error as any)?.context;
      if (ctx instanceof Response) {
        const body = await ctx.json();
        if (body && typeof body === 'object') return body as NfeSubmitResult;
      }
    } catch { /* response body already consumed or not JSON */ }

    // Fallback: try to parse the error message itself as JSON
    try {
      const msg = (error as any)?.message;
      if (msg && msg.startsWith('{')) {
        const parsed = JSON.parse(msg);
        if (parsed && typeof parsed === 'object') return parsed as NfeSubmitResult;
      }
    } catch { /* not JSON */ }

    return {
      ok: false,
      error: 'EDGE_ERROR',
      detail: (error as any)?.message || String(error),
    };
  }

  return data as NfeSubmitResult;
}

export async function fiscalNfeCalcularImpostos(emissaoId: string) {
  return callRpc<{ ok: boolean; items_calculated: number; cfop_applied: string | null; is_intrastate: boolean }>(
    'fiscal_nfe_calcular_impostos',
    { p_emissao_id: emissaoId },
  );
}

export async function fiscalNfeGerarDePedido(pedidoId: string, ambiente?: AmbienteNfe): Promise<string> {
  return callRpc<string>('fiscal_nfe_gerar_de_pedido', {
    p_pedido_id: pedidoId,
    p_ambiente: ambiente ?? null,
  });
}

export async function fiscalNfeConsultaStatus(emissaoId: string): Promise<NfeSubmitResult> {
  const { data, error } = await supabase.functions.invoke('focusnfe-status', {
    body: { emissao_id: emissaoId },
  });
  if (error) {
    const msg = (error as any)?.message || String(error);
    return { ok: false, error: 'EDGE_ERROR', detail: msg };
  }
  return data as NfeSubmitResult;
}

