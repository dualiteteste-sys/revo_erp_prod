import { callRpc } from '@/lib/api';

export type DevolucaoFornecedorCreateItem = {
  recebimentoItemId: string;
  quantidade: number;
};

export async function createDevolucaoFornecedor(params: {
  recebimentoId: string;
  depositoId?: string | null;
  motivo?: string | null;
  itens: DevolucaoFornecedorCreateItem[];
}): Promise<string> {
  return callRpc<string>('suprimentos_devolucao_fornecedor_create', {
    p_recebimento_id: params.recebimentoId,
    p_deposito_id: params.depositoId ?? null,
    p_motivo: params.motivo ?? null,
    p_itens: params.itens.map((i) => ({
      recebimento_item_id: i.recebimentoItemId,
      quantidade: i.quantidade,
    })),
  });
}

export async function applyDevolucaoFornecedor(devolucaoId: string): Promise<{ status: string; movimentos?: number }> {
  return callRpc('suprimentos_devolucao_fornecedor_apply', { p_devolucao_id: devolucaoId });
}

