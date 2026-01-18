import { callRpc } from '@/lib/api';

export type OpsHealthSummary = {
  from: string;
  to: string;
  app_errors: number;
  db_events: number;
  nfe_webhooks: {
    pending: number;
    failed: number;
    locked: number;
  };
  finance?: {
    pending: number;
    failed: number;
    locked: number;
  };
  stripe?: {
    pending: number;
    failed: number;
    locked: number;
  };
};

export type ProductMetricsSummary = {
  from: string;
  to: string;
  rpc: {
    count: number;
    error_count: number;
    error_rate_pct: number;
    p50_ms: number;
    p95_ms: number;
  };
  first_value: {
    min_ms: number;
  };
};

export type BusinessKpisFunnelSummary = {
  ok: boolean;
  reason?: string;
  empresa_id?: string;
  empresa_created_at?: string | null;
  setup?: { ok: number; total: number; done: boolean };
  first_sale?: { at: string | null; days_to_first: number | null };
  first_nfe?: { at: string | null; days_to_first: number | null };
  first_payment?: { at: string | null; days_to_first: number | null };
};

export type OpsRecentFailure = {
  kind: string;
  occurred_at: string;
  message: string;
  source: string;
  meta: Record<string, unknown> | null;
};

export type FinanceDlqRow = {
  id: string;
  dead_lettered_at: string;
  job_type: string;
  idempotency_key: string | null;
  last_error: string | null;
};

export type EcommerceDlqRow = {
  id: string;
  failed_at: string;
  provider: string;
  kind: string;
  dedupe_key: string | null;
  last_error: string;
};

export type NfeWebhookRow = {
  id: string;
  received_at: string;
  event_type: string | null;
  provider: string | null;
  nfeio_id: string | null;
  process_attempts: number;
  next_retry_at: string | null;
  locked_at: string | null;
  last_error: string | null;
};

export type StripeWebhookRow = {
  id: string;
  received_at: string;
  event_type: string;
  stripe_event_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan_slug: string | null;
  billing_cycle: string | null;
  process_attempts: number;
  next_retry_at: string | null;
  locked_at: string | null;
  last_error: string | null;
};

export type DlqReprocessResult = {
  mode: 'dry_run' | 'reprocess';
  preview?: Record<string, unknown> | null;
  new_job_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export async function getOpsHealthSummary(): Promise<OpsHealthSummary> {
  const raw: any = await callRpc<any>('ops_health_summary', { p_window: null });
  const nfe = (raw?.nfe_webhooks ?? raw?.nfeio ?? { pending: 0, failed: 0, locked: 0 }) as OpsHealthSummary['nfe_webhooks'];
  const { nfeio, ...rest } = raw ?? {};
  return { ...(rest as Omit<OpsHealthSummary, 'nfe_webhooks'>), nfe_webhooks: nfe };
}

export async function getProductMetricsSummary(): Promise<ProductMetricsSummary> {
  return callRpc<ProductMetricsSummary>('product_metrics_summary', { p_window: null });
}

export async function getBusinessKpisFunnelSummary(): Promise<BusinessKpisFunnelSummary> {
  return callRpc<BusinessKpisFunnelSummary>('business_kpis_funnel_for_current_empresa', {});
}

export async function listOpsRecentFailures(params?: { from?: string | null; limit?: number }): Promise<OpsRecentFailure[]> {
  return callRpc<OpsRecentFailure[]>('ops_recent_failures', {
    p_from: params?.from ?? null,
    p_limit: params?.limit ?? 50,
  });
}

export async function listOpsFinanceDlq(params?: { limit?: number }): Promise<FinanceDlqRow[]> {
  return callRpc<FinanceDlqRow[]>('ops_finance_dlq_list', { p_limit: params?.limit ?? 30 });
}

export async function listOpsEcommerceDlq(params?: { limit?: number }): Promise<EcommerceDlqRow[]> {
  return callRpc<EcommerceDlqRow[]>('ops_ecommerce_dlq_list', { p_limit: params?.limit ?? 30 });
}

export async function listOpsNfeWebhookErrors(params?: { limit?: number }): Promise<NfeWebhookRow[]> {
  return callRpc<NfeWebhookRow[]>('ops_fiscal_nfe_webhook_errors_list', { p_limit: params?.limit ?? 30 });
}

export async function listOpsStripeWebhookErrors(params?: { limit?: number }): Promise<StripeWebhookRow[]> {
  return callRpc<StripeWebhookRow[]>('ops_billing_stripe_webhook_errors_list', { p_limit: params?.limit ?? 30 });
}

export async function reprocessFinanceDlq(dlqId: string): Promise<string> {
  return callRpc<string>('ops_finance_dlq_reprocess', { p_dlq_id: dlqId });
}

export async function reprocessEcommerceDlq(dlqId: string): Promise<string> {
  return callRpc<string>('ops_ecommerce_dlq_reprocess', { p_dlq_id: dlqId });
}

export async function dryRunFinanceDlq(dlqId: string): Promise<DlqReprocessResult> {
  return callRpc<DlqReprocessResult>('ops_finance_dlq_reprocess_v2', { p_dlq_id: dlqId, p_dry_run: true });
}

export async function dryRunEcommerceDlq(dlqId: string): Promise<DlqReprocessResult> {
  return callRpc<DlqReprocessResult>('ops_ecommerce_dlq_reprocess_v2', { p_dlq_id: dlqId, p_dry_run: true });
}

export async function reprocessNfeWebhookEvent(id: string): Promise<void> {
  await callRpc('ops_nfe_webhook_reprocess', { p_id: id });
}

export async function dryRunNfeWebhookEvent(id: string): Promise<DlqReprocessResult> {
  return callRpc<DlqReprocessResult>('ops_nfe_webhook_reprocess_v2', { p_id: id, p_dry_run: true });
}

export async function reprocessStripeWebhookEvent(id: string): Promise<void> {
  await callRpc('ops_stripe_webhook_reprocess', { p_id: id });
}

export async function dryRunStripeWebhookEvent(id: string): Promise<DlqReprocessResult> {
  return callRpc<DlqReprocessResult>('ops_stripe_webhook_reprocess_v2', { p_id: id, p_dry_run: true });
}

export async function seedFinanceDlq(jobType?: string): Promise<string> {
  return callRpc<string>('ops_finance_dlq_seed', { p_job_type: jobType ?? 'test' });
}

export async function seedEcommerceDlq(provider?: string, kind?: string): Promise<string> {
  return callRpc<string>('ops_ecommerce_dlq_seed', { p_provider: provider ?? 'meli', p_kind: kind ?? 'test' });
}
