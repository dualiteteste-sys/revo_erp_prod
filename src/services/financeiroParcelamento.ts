import { callRpc } from '@/lib/api';

export type ParcelamentoPreviewItem = {
  numero_parcela: number;
  vencimento: string;
  valor: number;
};

export type ParcelamentoCreateResult = {
  ok: boolean;
  parcelamento_id: string;
  count: number;
  contas_ids: string[];
};

export async function previewParcelamento(params: {
  total: number;
  condicao: string;
  baseDateISO: string;
}): Promise<ParcelamentoPreviewItem[]> {
  return callRpc<ParcelamentoPreviewItem[]>('financeiro_parcelamento_preview', {
    p_total: params.total,
    p_condicao: params.condicao ?? null,
    p_base_date: params.baseDateISO ?? null,
  });
}

export async function createParcelamentoFromCompra(params: {
  compraId: string;
  condicao: string;
  baseDateISO: string;
}): Promise<ParcelamentoCreateResult> {
  return callRpc<ParcelamentoCreateResult>('financeiro_parcelamento_from_compra_create', {
    p_compra_id: params.compraId,
    p_condicao: params.condicao ?? null,
    p_base_date: params.baseDateISO ?? null,
  });
}

export async function createParcelamentoFromVenda(params: {
  pedidoId: string;
  condicao: string;
  baseDateISO: string;
}): Promise<ParcelamentoCreateResult> {
  return callRpc<ParcelamentoCreateResult>('financeiro_parcelamento_from_venda_create', {
    p_pedido_id: params.pedidoId,
    p_condicao: params.condicao ?? null,
    p_base_date: params.baseDateISO ?? null,
  });
}

export async function createParcelamentoContasPagar(params: {
  fornecedorId: string;
  descricao: string;
  total: number;
  condicao: string;
  baseDateISO: string;
  dataEmissaoISO?: string | null;
  documentoRef?: string | null;
  categoria?: string | null;
  centroDeCustoId?: string | null;
  formaPagamento?: string | null;
  observacoes?: string | null;
  origemTipo?: string | null;
  origemId?: string | null;
}): Promise<ParcelamentoCreateResult> {
  return callRpc<ParcelamentoCreateResult>('financeiro_parcelamento_create_contas_pagar', {
    p_fornecedor_id: params.fornecedorId,
    p_descricao: params.descricao,
    p_total: params.total,
    p_condicao: params.condicao ?? null,
    p_base_date: params.baseDateISO ?? null,
    p_data_emissao: params.dataEmissaoISO ?? null,
    p_documento_ref: params.documentoRef ?? null,
    p_categoria: params.categoria ?? null,
    p_centro_de_custo_id: params.centroDeCustoId ?? null,
    p_forma_pagamento: params.formaPagamento ?? null,
    p_observacoes: params.observacoes ?? null,
    p_origem_tipo: params.origemTipo ?? null,
    p_origem_id: params.origemId ?? null,
  });
}

export async function createParcelamentoContasAReceber(params: {
  clienteId: string;
  descricao: string;
  total: number;
  condicao: string;
  baseDateISO: string;
  centroDeCustoId?: string | null;
  observacoes?: string | null;
  origemTipo?: string | null;
  origemId?: string | null;
}): Promise<ParcelamentoCreateResult> {
  return callRpc<ParcelamentoCreateResult>('financeiro_parcelamento_create_contas_a_receber', {
    p_cliente_id: params.clienteId,
    p_descricao: params.descricao,
    p_total: params.total,
    p_condicao: params.condicao ?? null,
    p_base_date: params.baseDateISO ?? null,
    p_centro_de_custo_id: params.centroDeCustoId ?? null,
    p_observacoes: params.observacoes ?? null,
    p_origem_tipo: params.origemTipo ?? null,
    p_origem_id: params.origemId ?? null,
  });
}

