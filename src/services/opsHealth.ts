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
};

export type OpsRecentFailure = {
  kind: string;
  occurred_at: string;
  message: string;
  source: string;
  meta: Record<string, unknown> | null;
};

export async function getOpsHealthSummary(): Promise<OpsHealthSummary> {
  return callRpc<OpsHealthSummary>('ops_health_summary', { p_window: null });
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

