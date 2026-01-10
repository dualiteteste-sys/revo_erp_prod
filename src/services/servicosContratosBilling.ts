import { supabase } from '@/lib/supabaseClient';

const sb = supabase as any;

export type BillingRuleTipo = 'mensal' | 'avulso';

export type ServicosContratoBillingRule = {
  id: string;
  empresa_id: string;
  contrato_id: string;
  tipo: BillingRuleTipo;
  ativo: boolean;
  valor_mensal: number;
  dia_vencimento: number;
  primeira_competencia: string;
  centro_de_custo_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingScheduleStatus = 'previsto' | 'gerado' | 'cancelado';

export type ServicosContratoBillingSchedule = {
  id: string;
  empresa_id: string;
  contrato_id: string;
  rule_id: string;
  kind: BillingRuleTipo;
  competencia: string | null;
  data_vencimento: string;
  valor: number;
  status: BillingScheduleStatus;
  conta_a_receber_id: string | null;
  cobranca_id: string | null;
  descricao?: string | null;
  created_at: string;
  updated_at: string;
};

export async function getBillingRuleByContratoId(contratoId: string): Promise<ServicosContratoBillingRule | null> {
  const { data, error } = await sb
    .from('servicos_contratos_billing_rules')
    .select('*')
    .eq('contrato_id', contratoId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as any;
}

export async function upsertBillingRule(payload: {
  contrato_id: string;
  tipo: BillingRuleTipo;
  ativo: boolean;
  valor_mensal: number;
  dia_vencimento: number;
  primeira_competencia: string;
  centro_de_custo_id: string | null;
}): Promise<ServicosContratoBillingRule> {
  const { data, error } = await sb
    .from('servicos_contratos_billing_rules')
    .upsert(payload, { onConflict: 'empresa_id,contrato_id' })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function listScheduleByContratoId(contratoId: string, limit = 24): Promise<ServicosContratoBillingSchedule[]> {
  const { data, error } = await sb
    .from('servicos_contratos_billing_schedule')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('data_vencimento', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as any;
}

export async function generateSchedule(params: { contratoId: string; monthsAhead?: number }): Promise<{ inserted: number }> {
  const { contratoId, monthsAhead = 12 } = params;
  const { data, error } = await sb.rpc('servicos_contratos_billing_generate_schedule', {
    p_contrato_id: contratoId,
    p_months_ahead: monthsAhead,
  });
  if (error) throw error;
  return { inserted: Number(data?.inserted ?? 0) };
}

export async function generateReceivables(params: {
  contratoId: string;
  until: string;
  monthsAhead?: number | null;
}): Promise<{ created: number; reason?: string; monthsAhead?: number }> {
  const { contratoId, until, monthsAhead } = params;
  const args: any = {
    p_contrato_id: contratoId,
    p_until: until,
  };
  if (monthsAhead != null) args.p_months_ahead = monthsAhead;

  const { data, error } = await sb.rpc('servicos_contratos_billing_generate_receivables', args);
  if (error) throw error;
  return {
    created: Number(data?.created ?? 0),
    reason: data?.reason ?? undefined,
    monthsAhead: data?.months_ahead != null ? Number(data.months_ahead) : undefined,
  };
}

export async function cancelFutureBilling(params: {
  contratoId: string;
  cancelReceivables?: boolean;
  reason?: string | null;
}): Promise<{ scheduleCancelled: number; receivablesCancelled: number; cobrancasCancelled: number }> {
  const { contratoId, cancelReceivables = false, reason = null } = params;
  const { data, error } = await sb.rpc('servicos_contratos_billing_cancel_future', {
    p_contrato_id: contratoId,
    p_cancel_receivables: cancelReceivables,
    p_reason: reason,
  });
  if (error) throw error;
  return {
    scheduleCancelled: Number(data?.schedule_cancelled ?? 0),
    receivablesCancelled: Number(data?.receivables_cancelled ?? 0),
    cobrancasCancelled: Number(data?.cobrancas_cancelled ?? 0),
  };
}

export async function addAvulso(params: {
  contratoId: string;
  dataVencimento: string;
  valor: number;
  descricao?: string | null;
}): Promise<ServicosContratoBillingSchedule> {
  const { contratoId, dataVencimento, valor, descricao = null } = params;
  const { data, error } = await sb.rpc('servicos_contratos_billing_add_avulso', {
    p_contrato_id: contratoId,
    p_data_vencimento: dataVencimento,
    p_valor: valor,
    p_descricao: descricao,
  });
  if (error) throw error;
  return data as any;
}

export async function recalcMensalFuture(params: { contratoId: string; from?: string | null }): Promise<{ updated: number; reason?: string }> {
  const { contratoId, from = null } = params;
  const { data, error } = await sb.rpc('servicos_contratos_billing_recalc_mensal_future', {
    p_contrato_id: contratoId,
    p_from: from,
  });
  if (error) throw error;
  return { updated: Number(data?.updated ?? 0), reason: data?.reason ?? undefined };
}
