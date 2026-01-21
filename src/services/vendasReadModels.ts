import { callRpc } from "@/lib/api";

export type PdvPedidoRow = {
  id: string;
  numero: number;
  status: string;
  total_geral: number;
  data_emissao: string;
  updated_at: string;
  pdv_estornado_at?: string | null;
};

export type VendaComissaoRow = {
  id: string;
  numero: number;
  vendedor_id: string | null;
  comissao_percent: number;
  total_geral: number;
  data_emissao: string;
  status: string;
};

export async function listPdvPedidos(params?: { limit?: number }): Promise<PdvPedidoRow[]> {
  return callRpc<PdvPedidoRow[]>("vendas_pdv_pedidos_list", { p_limit: params?.limit ?? 200 });
}

export async function listVendasComissoes(params?: { limit?: number }): Promise<VendaComissaoRow[]> {
  return callRpc<VendaComissaoRow[]>("vendas_comissoes_pedidos_list", { p_limit: params?.limit ?? 500 });
}

export async function getRelatoriosVendasTotais(): Promise<{ pdvTotal: number; devolucoesTotal: number }> {
  const res = await callRpc<any>("vendas_relatorios_totais_pdv_devolucoes", {});
  return {
    pdvTotal: Number(res?.pdv_total ?? 0),
    devolucoesTotal: Number(res?.devolucoes_total ?? 0),
  };
}

