import { callRpc } from '../lib/api';

export type Vendedor = {
  id: string;
  empresa_id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  comissao_percent: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type VendedorInsert = {
  nome: string;
  email?: string | null;
  telefone?: string | null;
  comissao_percent?: number;
  ativo?: boolean;
};

export type VendedorUpdate = Partial<VendedorInsert>;

export async function listVendedores(search?: string, ativoOnly = false): Promise<Vendedor[]> {
  return callRpc<Vendedor[]>('vendedores_list_full_for_current_empresa', {
    p_q: search ?? null,
    p_ativo_only: ativoOnly,
    p_limit: 500,
  });
}

export async function getVendedor(id: string): Promise<Vendedor> {
  return callRpc<Vendedor>('vendedores_get_for_current_empresa', { p_id: id });
}

export async function createVendedor(payload: VendedorInsert): Promise<Vendedor> {
  return callRpc<Vendedor>('vendedores_upsert_for_current_empresa', {
    p_id: null,
    p_nome: payload.nome,
    p_email: payload.email ?? null,
    p_telefone: payload.telefone ?? null,
    p_comissao_percent: payload.comissao_percent ?? null,
    p_ativo: payload.ativo ?? true,
    p_idempotency_key: null,
  });
}

export async function updateVendedor(id: string, payload: VendedorUpdate): Promise<Vendedor> {
  const current = await getVendedor(id);
  return callRpc<Vendedor>('vendedores_upsert_for_current_empresa', {
    p_id: id,
    p_nome: payload.nome ?? current.nome,
    p_email: payload.email ?? current.email,
    p_telefone: payload.telefone ?? current.telefone,
    p_comissao_percent: payload.comissao_percent ?? current.comissao_percent,
    p_ativo: payload.ativo ?? current.ativo,
    p_idempotency_key: null,
  });
}

export async function deleteVendedor(id: string): Promise<void> {
  await callRpc('vendedores_delete_for_current_empresa', { p_id: id });
}
