import { supabase } from '@/lib/supabaseClient';

const sb = supabase as any;

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
  const { data, error } = await sb
    .from('servicos_contratos_itens')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('pos', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function upsertContratoItem(payload: Partial<ServicosContratoItem> & { contrato_id: string; titulo: string }): Promise<ServicosContratoItem> {
  const { data, error } = await sb.from('servicos_contratos_itens').upsert(payload as any).select().single();
  if (error) throw error;
  return data as any;
}

export async function deleteContratoItem(id: string): Promise<void> {
  const { error } = await sb.from('servicos_contratos_itens').delete().eq('id', id);
  if (error) throw error;
}

