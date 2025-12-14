import { callRpc } from '@/lib/api';

export interface OperadorAuthResult {
  id: string;
  nome: string;
  email: string | null;
  centros_trabalho_ids: string[];
}

export async function autenticarOperador(pin: string, nomeOuEmail?: string): Promise<OperadorAuthResult | null> {
  const result = await callRpc<OperadorAuthResult[]>('industria_operador_autenticar', {
    p_pin: pin,
    p_nome: nomeOuEmail || null
  });
  return result && result.length > 0 ? result[0] : null;
}

export interface OperadorRecord {
  id: string;
  nome: string;
  email: string | null;
  centros_trabalho_ids: string[];
  ativo: boolean;
  created_at: string;
}

export async function listOperadores(search?: string): Promise<OperadorRecord[]> {
  return callRpc<OperadorRecord[]>('industria_operadores_list', { p_search: search || null });
}

export interface OperadorPayload {
  id?: string;
  nome: string;
  email?: string | null;
  pin: string;
  centros_trabalho_ids?: string[];
  ativo?: boolean;
}

export async function upsertOperador(payload: OperadorPayload): Promise<string> {
  return callRpc<string>('industria_operador_upsert', {
    p_id: payload.id || null,
    p_nome: payload.nome,
    p_email: payload.email || null,
    p_pin: payload.pin,
    p_centros: payload.centros_trabalho_ids || null,
    p_ativo: payload.ativo ?? true,
  });
}

export async function deleteOperador(id: string): Promise<void> {
  await callRpc('industria_operador_delete', { p_id: id });
}
