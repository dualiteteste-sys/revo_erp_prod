import { callRpc } from '@/lib/api';

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
  tipo: 'entrada' | 'saida' | 'ajuste_entrada' | 'ajuste_saida' | 'perda' | 'inventario';
  quantidade: number;
  saldo_anterior: number;
  saldo_novo: number;
  documento_ref: string | null;
  observacao: string | null;
  created_at: string;
  usuario_email: string | null;
};

export type RegistrarMovimentoPayload = {
  produto_id: string;
  tipo: string;
  quantidade: number;
  custo_unitario?: number;
  documento_ref?: string;
  observacao?: string;
};

export async function listPosicaoEstoque(search?: string, baixoEstoque?: boolean): Promise<EstoquePosicao[]> {
  return callRpc<EstoquePosicao[]>('suprimentos_list_posicao_estoque', {
    p_search: search || null,
    p_baixo_estoque: baixoEstoque || false,
  });
}

export async function getKardex(produtoId: string, limit = 50): Promise<EstoqueMovimento[]> {
  return callRpc<EstoqueMovimento[]>('suprimentos_get_kardex', {
    p_produto_id: produtoId,
    p_limit: limit,
  });
}

export async function registrarMovimento(payload: RegistrarMovimentoPayload): Promise<void> {
  await callRpc('suprimentos_registrar_movimento', {
    p_produto_id: payload.produto_id,
    p_tipo: payload.tipo,
    p_quantidade: payload.quantidade,
    p_custo_unitario: payload.custo_unitario || null,
    p_documento_ref: payload.documento_ref || null,
    p_observacao: payload.observacao || null,
  });
}
