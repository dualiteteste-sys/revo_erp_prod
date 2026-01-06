import { callRpc } from '@/lib/api';

export type Unidade = {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export async function listUnidades(): Promise<Unidade[]> {
  return callRpc<Unidade[]>('unidades_list', {});
}

export async function upsertUnidade(payload: {
  id?: string;
  nome: string;
  codigo?: string | null;
  ativo?: boolean;
  is_default?: boolean;
}): Promise<string> {
  return callRpc<string>('unidades_upsert', {
    p_payload: {
      id: payload.id,
      nome: payload.nome,
      codigo: payload.codigo ?? null,
      ativo: payload.ativo ?? true,
      is_default: payload.is_default ?? false,
    },
  });
}

export async function deleteUnidade(id: string): Promise<void> {
  await callRpc('unidades_delete', { p_id: id });
}

export async function setActiveUnidade(id: string): Promise<string> {
  return callRpc<string>('unidades_set_active', { p_unidade_id: id });
}

