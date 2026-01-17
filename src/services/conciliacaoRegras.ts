import { callRpc } from '@/lib/api';

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
  const data = await callRpc<ConciliacaoRegra[]>('financeiro_conciliacao_regras_list', {
    p_conta_corrente_id: contaCorrenteId ?? null,
  });
  return data ?? [];
}

export async function upsertConciliacaoRegra(payload: ConciliacaoRegraUpsert): Promise<ConciliacaoRegra> {
  const rows = await callRpc<ConciliacaoRegra[]>('financeiro_conciliacao_regras_upsert', { p_payload: payload });
  const row = rows?.[0];
  if (!row) throw new Error('Não foi possível salvar a regra.');
  return row;
}

export async function deleteConciliacaoRegra(id: string): Promise<void> {
  await callRpc('financeiro_conciliacao_regras_delete', { p_id: id });
}
