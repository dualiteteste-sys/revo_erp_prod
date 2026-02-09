import { callRpc } from '@/lib/api';

export type EcommerceImportProvider = 'meli' | 'shopee' | 'woo';
export type EcommerceImportKind = 'import_orders' | 'import_products' | 'sync_stock' | 'sync_prices';
export type EcommerceImportJobStatus = 'pending' | 'processing' | 'done' | 'error' | 'dead' | 'canceled';

export type EcommerceImportJob = {
  id: string;
  provider: EcommerceImportProvider;
  kind: EcommerceImportKind;
  status: EcommerceImportJobStatus;
  attempts: number;
  max_attempts: number;
  scheduled_for: string | null;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  items_total: number;
  items_failed: number;
};

export type EcommerceImportJobRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  error: string | null;
  meta: Record<string, unknown>;
};

export type EcommerceImportJobItem = {
  id: string;
  run_id: string | null;
  external_id: string | null;
  sku: string | null;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  status: 'created' | 'updated' | 'skipped' | 'failed';
  message: string | null;
  context: Record<string, unknown>;
  created_at: string;
};

export type EcommerceImportJobDetail = {
  job: Record<string, unknown>;
  runs: EcommerceImportJobRun[];
  items: EcommerceImportJobItem[];
};

export async function enqueueEcommerceImportJob(params: {
  provider: EcommerceImportProvider;
  kind: EcommerceImportKind;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  scheduledFor?: string | null;
  maxAttempts?: number | null;
}): Promise<{ job_id: string; status: EcommerceImportJobStatus }> {
  return callRpc('ecommerce_import_job_enqueue', {
    p_provider: params.provider,
    p_kind: params.kind,
    p_payload: params.payload ?? {},
    p_idempotency_key: params.idempotencyKey ?? null,
    p_scheduled_for: params.scheduledFor ?? null,
    p_max_attempts: params.maxAttempts ?? 10,
  });
}

export async function listEcommerceImportJobs(params?: {
  provider?: EcommerceImportProvider | null;
  kind?: EcommerceImportKind | null;
  status?: EcommerceImportJobStatus | null;
  limit?: number;
  offset?: number;
}): Promise<EcommerceImportJob[]> {
  return callRpc<EcommerceImportJob[]>('ecommerce_import_jobs_list', {
    p_provider: params?.provider ?? null,
    p_kind: params?.kind ?? null,
    p_status: params?.status ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  });
}

export async function getEcommerceImportJob(jobId: string, options?: {
  runsLimit?: number;
  itemsLimit?: number;
}): Promise<EcommerceImportJobDetail> {
  return callRpc<EcommerceImportJobDetail>('ecommerce_import_job_get', {
    p_job_id: jobId,
    p_runs_limit: options?.runsLimit ?? 20,
    p_items_limit: options?.itemsLimit ?? 200,
  });
}

export async function cancelEcommerceImportJob(jobId: string): Promise<boolean> {
  return callRpc<boolean>('ecommerce_import_job_cancel', {
    p_job_id: jobId,
  });
}

export async function retryEcommerceImportJob(jobId: string, reason?: string | null): Promise<{
  source_job_id: string;
  new_job_id: string;
  status: EcommerceImportJobStatus;
}> {
  return callRpc('ecommerce_import_job_retry_failed', {
    p_job_id: jobId,
    p_reason: reason ?? null,
  });
}
