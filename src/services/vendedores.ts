import { supabase } from '../lib/supabaseClient';

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
  const sb = supabase as any;
  let query = sb
    .from('vendedores')
    .select('*')
    .order('nome', { ascending: true });

  if (ativoOnly) query = query.eq('ativo', true);
  if (search) query = query.ilike('nome', `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Vendedor[];
}

export async function getVendedor(id: string): Promise<Vendedor> {
  const sb = supabase as any;
  const { data, error } = await sb.from('vendedores').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Vendedor;
}

export async function createVendedor(payload: VendedorInsert): Promise<Vendedor> {
  const sb = supabase as any;
  const { data, error } = await sb
    .from('vendedores')
    // @ts-ignore
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as Vendedor;
}

export async function updateVendedor(id: string, payload: VendedorUpdate): Promise<Vendedor> {
  const sb = supabase as any;
  const { data, error } = await sb
    .from('vendedores')
    // @ts-ignore
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Vendedor;
}

export async function deleteVendedor(id: string): Promise<void> {
  const sb = supabase as any;
  const { error } = await sb.from('vendedores').delete().eq('id', id);
  if (error) throw error;
}
