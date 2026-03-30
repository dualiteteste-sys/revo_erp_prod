import { supabase } from '@/lib/supabaseClient';

export interface Marca {
  id: string;
  nome: string;
  created_at?: string;
}

export interface MarcaPayload {
  id?: string;
  nome: string;
}

export async function listMarcas(search?: string): Promise<Marca[]> {
  // @ts-ignore
  const { data, error } = await supabase.rpc('list_marcas', {
    p_search: search || null,
  });

  if (error) throw error;
  return data || [];
}

export async function upsertMarca(payload: MarcaPayload): Promise<Marca> {
  // @ts-ignore
  const { data, error } = await supabase.rpc('upsert_marca', {
    p_payload: payload,
  });

  if (error) throw error;
  return data;
}

export async function deleteMarca(id: string): Promise<void> {
  // @ts-ignore
  const { error } = await supabase.rpc('delete_marca', {
    p_id: id,
  });

  if (error) throw error;
}
