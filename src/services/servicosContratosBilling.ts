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

export async function generateReceivables(params: { contratoId: string; until: string }): Promise<{ created: number; reason?: string }> {
  const { contratoId, until } = params;
  const { data, error } = await sb.rpc('servicos_contratos_billing_generate_receivables', {
    p_contrato_id: contratoId,
    p_until: until,
  });
  if (error) throw error;
  return { created: Number(data?.created ?? 0), reason: data?.reason ?? undefined };
}

