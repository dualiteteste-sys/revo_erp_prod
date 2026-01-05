import { callRpc } from '@/lib/api';
import { RpcError } from '@/lib/api';

export type EstoquePosicao = {
  produto_id: string;
  nome: string;
  sku: string | null;
  unidade: string;
  saldo: number;
  custo_medio: number;
  estoque_min: number | null;
  status_estoque: 'ok' | 'baixo' | 'zerado';
};

export type EstoqueMovimento = {
  id: string;
  tipo:
    | 'entrada'
    | 'saida'
    | 'ajuste_entrada'
    | 'ajuste_saida'
    | 'perda'
    | 'inventario'
    | 'entrada_beneficiamento'
    | 'transfer_in'
    | 'transfer_out';
  quantidade: number;
  saldo_anterior: number;
  saldo_novo: number;
  documento_ref: string | null;
  observacao: string | null;
  created_at: string;
  usuario_email: string | null;
  deposito_id?: string | null;
  deposito_nome?: string | null;
};

export type RegistrarMovimentoPayload = {
  produto_id: string;
  tipo: string;
  quantidade: number;
  custo_unitario?: number;
  documento_ref?: string;
  observacao?: string;
  deposito_id?: string | null;
};

export type EstoqueDeposito = {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  is_default: boolean;
  can_view: boolean;
  can_move: boolean;
};

// Novos tipos para relatórios
export type RelatorioValorizacaoItem = {
  produto_id: string;
  nome: string;
  sku: string | null;
  unidade: string;
  saldo: number;
  custo_medio: number;
  valor_total: number;
  percentual: number;
  acumulado: number;
  classe: 'A' | 'B' | 'C';
};

export type RelatorioBaixoEstoqueItem = {
  produto_id: string;
  nome: string;
  sku: string | null;
  unidade: string;
  saldo: number;
  estoque_min: number | null;
  estoque_max: number | null;
  sugestao_compra: number;
  fornecedor_nome: string | null;
};

export async function listPosicaoEstoque(search?: string, baixoEstoque?: boolean): Promise<EstoquePosicao[]> {
  return callRpc<EstoquePosicao[]>('suprimentos_list_posicao_estoque', {
    p_search: search || null,
    p_baixo_estoque: baixoEstoque || false,
  });
}

export async function listDepositos(params?: { onlyActive?: boolean }): Promise<EstoqueDeposito[]> {
  try {
    const payload = await callRpc<any>('suprimentos_depositos_list', { p_only_active: params?.onlyActive ?? true });
    return Array.isArray(payload) ? (payload as EstoqueDeposito[]) : [];
  } catch (e: any) {
    if (e instanceof RpcError && e.status === 404) return [];
    throw e;
  }
}

export async function listPosicaoEstoqueV2(params: {
  search?: string | null;
  baixoEstoque?: boolean;
  depositoId?: string | null;
}): Promise<EstoquePosicao[]> {
  try {
    return await callRpc<EstoquePosicao[]>('suprimentos_list_posicao_estoque_v2', {
      p_search: params.search ?? null,
      p_baixo_estoque: params.baixoEstoque ?? false,
      p_deposito_id: params.depositoId ?? null,
    });
  } catch (e: any) {
    if (e instanceof RpcError && e.status === 404) {
      return listPosicaoEstoque(params.search ?? undefined, params.baixoEstoque ?? false);
    }
    throw e;
  }
}

export async function getKardex(produtoId: string, limit = 50): Promise<EstoqueMovimento[]> {
  return callRpc<EstoqueMovimento[]>('suprimentos_get_kardex', {
    p_produto_id: produtoId,
    p_limit: limit,
  });
}

export async function getKardexV2(produtoId: string, params?: { depositoId?: string | null; limit?: number }): Promise<EstoqueMovimento[]> {
  try {
    return await callRpc<EstoqueMovimento[]>('suprimentos_get_kardex_v2', {
      p_produto_id: produtoId,
      p_deposito_id: params?.depositoId ?? null,
      p_limit: params?.limit ?? 50,
    });
  } catch (e: any) {
    if (e instanceof RpcError && e.status === 404) {
      return getKardex(produtoId, params?.limit ?? 50);
    }
    throw e;
  }
}

export async function registrarMovimento(payload: RegistrarMovimentoPayload): Promise<void> {
  // prefer V2 quando houver depósito
  if (payload.deposito_id) {
    try {
      await callRpc('suprimentos_registrar_movimento_v2', {
        p_produto_id: payload.produto_id,
        p_deposito_id: payload.deposito_id,
        p_tipo: payload.tipo,
        p_quantidade: payload.quantidade,
        p_custo_unitario: payload.custo_unitario || null,
        p_documento_ref: payload.documento_ref || null,
        p_observacao: payload.observacao || null,
      });
      return;
    } catch (e: any) {
      if (!(e instanceof RpcError && e.status === 404)) throw e;
      // fallback v1 abaixo
    }
  }
  await callRpc('suprimentos_registrar_movimento', {
    p_produto_id: payload.produto_id,
    p_tipo: payload.tipo,
    p_quantidade: payload.quantidade,
    p_custo_unitario: payload.custo_unitario || null,
    p_documento_ref: payload.documento_ref || null,
    p_observacao: payload.observacao || null,
  });
}

export async function transferirEstoque(params: {
  produtoId: string;
  depositoFromId: string;
  depositoToId: string;
  quantidade: number;
  documentoRef?: string | null;
  observacao?: string | null;
}): Promise<void> {
  await callRpc('suprimentos_transferir_estoque', {
    p_produto_id: params.produtoId,
    p_deposito_from: params.depositoFromId,
    p_deposito_to: params.depositoToId,
    p_quantidade: params.quantidade,
    p_documento_ref: params.documentoRef ?? null,
    p_observacao: params.observacao ?? null,
  });
}

// Novas funções de relatório
export async function getRelatorioValorizacao(search?: string): Promise<RelatorioValorizacaoItem[]> {
  return callRpc<RelatorioValorizacaoItem[]>('suprimentos_relatorio_valorizacao', {
    p_search: search || null,
  });
}

export async function getRelatorioBaixoEstoque(search?: string): Promise<RelatorioBaixoEstoqueItem[]> {
  return callRpc<RelatorioBaixoEstoqueItem[]>('suprimentos_relatorio_baixo_estoque', {
    p_search: search || null,
  });
}
