import { callRpc } from '@/lib/api';

export type ServicosContratoItem = {
  id: string;
  empresa_id: string;
  contrato_id: string;
  pos: number;
  titulo: string;
  descricao: string | null;
  quantidade: number;
  unidade: string | null;
  valor_unitario: number;
  recorrente: boolean;
  created_at: string;
  updated_at: string;
};

export async function listItensByContratoId(contratoId: string): Promise<ServicosContratoItem[]> {
  const rows = await callRpc<any>('servicos_contratos_itens_list', { p_contrato_id: contratoId });
  return (rows ?? []) as any;
}

export async function upsertContratoItem(payload: Partial<ServicosContratoItem> & { contrato_id: string; titulo: string }): Promise<ServicosContratoItem> {
  const row = await callRpc<any>('servicos_contratos_itens_upsert', { p_payload: payload as any });
  return row as any;
}

export async function deleteContratoItem(id: string): Promise<void> {
  await callRpc<any>('servicos_contratos_itens_delete', { p_id: id });
}
