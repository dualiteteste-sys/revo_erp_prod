import { callRpc } from '@/lib/api';

export type FinanceiroRecorrenciaTipo = 'pagar' | 'receber';
export type FinanceiroRecorrenciaFrequencia =
  | 'semanal'
  | 'mensal'
  | 'bimestral'
  | 'trimestral'
  | 'semestral'
  | 'anual';

export type FinanceiroRecorrenciaAjusteDiaUtil = 'nao_ajustar' | 'proximo_dia_util' | 'dia_util_anterior';

export type FinanceiroRecorrencia = Record<string, any> & {
  id: string;
  tipo: FinanceiroRecorrenciaTipo;
};

export type FinanceiroRecorrenciaGenerateResult = {
  status: 'ok' | 'skipped';
  ocorrencias_novas?: number;
  contas_geradas?: number;
  contas_reparadas?: number;
  reason?: string;
};

export type FinanceiroRecorrenciaApplyScope = 'single' | 'future' | 'all_open';

export type FinanceiroRecorrenciaApplyUpdateResult = {
  ok: boolean;
  scope: FinanceiroRecorrenciaApplyScope;
  empresa_id: string;
  recorrencia_id: string;
  ocorrencia_id: string;
  updated_template: number;
  updated_accounts: number;
  skipped_locked: number;
  reason?: string;
};

export async function upsertRecorrencia(payload: Record<string, any>): Promise<FinanceiroRecorrencia> {
  return callRpc<FinanceiroRecorrencia>('financeiro_recorrencias_upsert', { p_payload: payload });
}

export async function generateRecorrencia(params: {
  recorrenciaId: string;
  until?: string | null; // YYYY-MM-DD
  max?: number;
}): Promise<FinanceiroRecorrenciaGenerateResult> {
  return callRpc<FinanceiroRecorrenciaGenerateResult>('financeiro_recorrencias_generate', {
    p_recorrencia_id: params.recorrenciaId,
    p_until: params.until ?? null,
    p_max: params.max ?? 24,
  });
}

export async function applyRecorrenciaUpdate(params: {
  ocorrenciaId: string;
  scope: FinanceiroRecorrenciaApplyScope;
  patch: Record<string, any>;
}): Promise<FinanceiroRecorrenciaApplyUpdateResult> {
  return callRpc<FinanceiroRecorrenciaApplyUpdateResult>('financeiro_recorrencias_apply_update', {
    p_ocorrencia_id: params.ocorrenciaId,
    p_scope: params.scope,
    p_patch: params.patch ?? {},
  });
}
