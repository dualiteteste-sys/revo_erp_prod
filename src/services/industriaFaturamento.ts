import { callRpc } from '@/lib/api';

// ─── Types ───────────────────────────────────

export type EntregaElegivel = {
  entrega_id: string;
  ordem_id: string;
  ordem_numero: number;
  produto_id: string;
  produto_nome: string;
  produto_sku: string | null;
  produto_ncm: string | null;
  produto_unidade: string;
  produto_preco_venda: number;
  cliente_id: string;
  cliente_nome: string;
  data_entrega: string;
  quantidade_entregue: number;
  quantidade_ja_faturada: number;
  quantidade_disponivel: number;
  documento_ref: string | null;
  observacoes: string | null;
};

export type ComporNfeItem = {
  entrega_id: string;
  quantidade: number;
  preco_unitario: number;
  descricao_override?: string;
  ncm_override?: string;
};

export type ComporNfeResult = {
  emissao_id: string;
  items_count: number;
  total: number;
};

export type LiberarResult = {
  updated_count: number;
};

// ─── RPC wrappers ────────────────────────────

export async function listarEntregasElegiveis(params: {
  clienteId?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<EntregaElegivel[]> {
  return callRpc<EntregaElegivel[]>('industria_faturamento_listar_elegiveis', {
    p_cliente_id: params.clienteId ?? null,
    p_data_inicio: params.dataInicio ?? null,
    p_data_fim: params.dataFim ?? null,
    p_search: params.search ?? null,
    p_limit: params.limit ?? 200,
    p_offset: params.offset ?? 0,
  });
}

export async function comporNfeBeneficiamento(params: {
  clienteId: string;
  naturezaOperacao: string;
  naturezaOperacaoId?: string | null;
  ambiente: string;
  itens: ComporNfeItem[];
}): Promise<ComporNfeResult> {
  return callRpc<ComporNfeResult>('industria_faturamento_compor_nfe', {
    p_cliente_id: params.clienteId,
    p_natureza_operacao: params.naturezaOperacao,
    p_natureza_operacao_id: params.naturezaOperacaoId ?? null,
    p_ambiente: params.ambiente,
    p_itens: params.itens,
  });
}

export async function liberarEntregasParaFaturamento(params: {
  ordemId?: string | null;
  entregaIds?: string[] | null;
}): Promise<LiberarResult> {
  return callRpc<LiberarResult>('industria_faturamento_liberar_entregas', {
    p_ordem_id: params.ordemId ?? null,
    p_entrega_ids: params.entregaIds ?? null,
  });
}
