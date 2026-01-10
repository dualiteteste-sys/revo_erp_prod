import { supabase } from '@/lib/supabaseClient';

const sb = supabase as any;

export type ServicosContratoTemplateAdmin = {
  id: string;
  empresa_id: string;
  slug: string;
  titulo: string;
  corpo: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listContratoTemplatesAdmin(params?: { includeInactive?: boolean }): Promise<ServicosContratoTemplateAdmin[]> {
  const { includeInactive = true } = params ?? {};
  let q = sb.from('servicos_contratos_templates').select('*').order('updated_at', { ascending: false });
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as any;
}

export async function upsertContratoTemplateAdmin(
  payload: Partial<ServicosContratoTemplateAdmin> & { slug: string; titulo: string; corpo: string },
): Promise<ServicosContratoTemplateAdmin> {
  const { data, error } = await sb.from('servicos_contratos_templates').upsert(payload as any).select().single();
  if (error) throw error;
  return data as any;
}

export async function deleteContratoTemplateAdmin(id: string): Promise<void> {
  const { error } = await sb.from('servicos_contratos_templates').delete().eq('id', id);
  if (error) throw error;
}

