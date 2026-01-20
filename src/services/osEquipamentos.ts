import { callRpc } from '@/lib/api';

export type OsEquipamento = {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  modelo: string;
  numero_serie: string | null;
  imei: string | null;
  acessorios: string | null;
  garantia_ate: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export type OsEquipamentoUpsert = {
  cliente_id?: string | null;
  modelo?: string;
  numero_serie?: string | null;
  imei?: string | null;
  acessorios?: string | null;
  garantia_ate?: string | null;
  observacoes?: string | null;
};

export async function listOsEquipamentos(clienteId: string, limit = 50): Promise<OsEquipamento[]> {
  const data = await callRpc<OsEquipamento[]>('os_equipamentos_list_for_current_user', {
    p_cliente_id: clienteId,
    p_limit: limit,
  });
  return (data || []) as OsEquipamento[];
}

export async function createOsEquipamento(payload: OsEquipamentoUpsert): Promise<OsEquipamento> {
  const data = await callRpc<OsEquipamento>('os_equipamentos_upsert_for_current_user', {
    p_id: null,
    p_cliente_id: payload.cliente_id ?? null,
    p_payload: payload,
  });
  return data as OsEquipamento;
}

export async function updateOsEquipamento(id: string, payload: OsEquipamentoUpsert): Promise<OsEquipamento> {
  const data = await callRpc<OsEquipamento>('os_equipamentos_upsert_for_current_user', {
    p_id: id,
    p_cliente_id: payload.cliente_id ?? null,
    p_payload: payload,
  });
  return data as OsEquipamento;
}
