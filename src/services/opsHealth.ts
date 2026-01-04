import { callRpc } from '@/lib/api';

export type OpsHealthSummary = {
  from: string;
  to: string;
  app_errors: number;
  db_events: number;
  nfeio: {
    pending: number;
    failed: number;
    locked: number;
  };
  finance?: {
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

export async function getOpsHealthSummary(): Promise<OpsHealthSummary> {
  return callRpc<OpsHealthSummary>('ops_health_summary', { p_window: null });
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

export async function reprocessNfeioWebhookEvent(id: string): Promise<void> {
  await callRpc('ops_nfeio_webhook_reprocess', { p_id: id });
}

export async function reprocessFinanceDlq(dlqId: string): Promise<string> {
  return callRpc<string>('ops_finance_dlq_reprocess', { p_dlq_id: dlqId });
}

export async function reprocessEcommerceDlq(dlqId: string): Promise<string> {
  return callRpc<string>('ops_ecommerce_dlq_reprocess', { p_dlq_id: dlqId });
}
