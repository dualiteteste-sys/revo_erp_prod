import { supabase } from '@/lib/supabaseClient';

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
  const { data, error } = await supabase
    .from('os_equipamentos')
    .select('id,empresa_id,cliente_id,modelo,numero_serie,imei,acessorios,garantia_ate,observacoes,created_at,updated_at')
    .eq('cliente_id', clienteId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as OsEquipamento[];
}

export async function createOsEquipamento(payload: OsEquipamentoUpsert): Promise<OsEquipamento> {
  const { data, error } = await supabase
    .from('os_equipamentos')
    .insert(payload)
    .select('id,empresa_id,cliente_id,modelo,numero_serie,imei,acessorios,garantia_ate,observacoes,created_at,updated_at')
    .single();

  if (error) throw error;
  return data as OsEquipamento;
}

export async function updateOsEquipamento(id: string, payload: OsEquipamentoUpsert): Promise<OsEquipamento> {
  const { data, error } = await supabase
    .from('os_equipamentos')
    .update(payload)
    .eq('id', id)
    .select('id,empresa_id,cliente_id,modelo,numero_serie,imei,acessorios,garantia_ate,observacoes,created_at,updated_at')
    .single();

  if (error) throw error;
  return data as OsEquipamento;
}

