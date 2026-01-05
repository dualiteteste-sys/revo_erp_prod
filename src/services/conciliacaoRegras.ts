import { supabase } from '@/lib/supabaseClient';

export type ConciliacaoRegra = {
  id: string;
  empresa_id: string;
  conta_corrente_id: string | null;
  tipo_lancamento: 'credito' | 'debito';
  match_text: string;
  min_valor: number | null;
  max_valor: number | null;
  categoria: string | null;
  centro_custo: string | null;
  descricao_override: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type ConciliacaoRegraUpsert = Partial<
  Pick<
    ConciliacaoRegra,
    | 'conta_corrente_id'
    | 'tipo_lancamento'
    | 'match_text'
    | 'min_valor'
    | 'max_valor'
    | 'categoria'
    | 'centro_custo'
    | 'descricao_override'
    | 'observacoes'
    | 'ativo'
  >
> & { id?: string };

export async function listConciliacaoRegras(contaCorrenteId: string | null): Promise<ConciliacaoRegra[]> {
  let q = supabase
    .from('financeiro_conciliacao_regras')
    .select(
      'id,empresa_id,conta_corrente_id,tipo_lancamento,match_text,min_valor,max_valor,categoria,centro_custo,descricao_override,observacoes,ativo,created_at,updated_at'
    )
    .order('updated_at', { ascending: false });

  q = contaCorrenteId ? q.eq('conta_corrente_id', contaCorrenteId) : q.is('conta_corrente_id', null);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ConciliacaoRegra[];
}

export async function upsertConciliacaoRegra(payload: ConciliacaoRegraUpsert): Promise<ConciliacaoRegra> {
  const { id, ...rest } = payload;
  const base = supabase
    .from('financeiro_conciliacao_regras')
    .upsert({ ...(id ? { id } : {}), ...rest }, { onConflict: 'id' })
    .select(
      'id,empresa_id,conta_corrente_id,tipo_lancamento,match_text,min_valor,max_valor,categoria,centro_custo,descricao_override,observacoes,ativo,created_at,updated_at'
    )
    .single();

  const { data, error } = await base;
  if (error) throw error;
  return data as ConciliacaoRegra;
}

export async function deleteConciliacaoRegra(id: string): Promise<void> {
  const { error } = await supabase.from('financeiro_conciliacao_regras').delete().eq('id', id);
  if (error) throw error;
}

