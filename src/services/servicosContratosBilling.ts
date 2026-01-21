import { callRpc } from '@/lib/api';

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
  const row = await callRpc<any>('servicos_contratos_billing_rule_get', { p_contrato_id: contratoId });
  return (row ?? null) as any;
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
  const row = await callRpc<any>('servicos_contratos_billing_rule_upsert', { p_payload: payload as any });
  return row as any;
}

export async function listScheduleByContratoId(contratoId: string, limit = 24): Promise<ServicosContratoBillingSchedule[]> {
  const rows = await callRpc<any>('servicos_contratos_billing_schedule_list', { p_contrato_id: contratoId, p_limit: limit });
  return (rows ?? []) as any;
}

export async function generateSchedule(params: { contratoId: string; monthsAhead?: number }): Promise<{ inserted: number }> {
  const { contratoId, monthsAhead = 12 } = params;
  const data = await callRpc<any>('servicos_contratos_billing_generate_schedule', {
    p_contrato_id: contratoId,
    p_months_ahead: monthsAhead,
  });
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

  const data = await callRpc<any>('servicos_contratos_billing_generate_receivables', args);
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
  const data = await callRpc<any>('servicos_contratos_billing_cancel_future', {
    p_contrato_id: contratoId,
    p_cancel_receivables: cancelReceivables,
    p_reason: reason,
  });
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
  const data = await callRpc<any>('servicos_contratos_billing_add_avulso', {
    p_contrato_id: contratoId,
    p_data_vencimento: dataVencimento,
    p_valor: valor,
    p_descricao: descricao,
  });
  return data as any;
}

export async function recalcMensalFuture(params: { contratoId: string; from?: string | null }): Promise<{ updated: number; reason?: string }> {
  const { contratoId, from = null } = params;
  const data = await callRpc<any>('servicos_contratos_billing_recalc_mensal_future', {
    p_contrato_id: contratoId,
    p_from: from,
  });
  return { updated: Number(data?.updated ?? 0), reason: data?.reason ?? undefined };
}
