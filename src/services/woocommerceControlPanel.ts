import { supabase } from '@/lib/supabaseClient';

type WooAdminAction =
  | 'stores.list'
  | 'stores.status'
  | 'stores.healthcheck'
  | 'stores.webhooks.register'
  | 'stores.product_map.build'
  | 'stores.product_map.list'
  | 'stores.sync.stock'
  | 'stores.sync.price'
  | 'stores.reconcile.orders'
  | 'stores.pause'
  | 'stores.unpause'
  | 'stores.worker.run'
  | 'stores.jobs.requeue';

export type WooStore = {
  id: string;
  base_url: string;
  auth_mode: string;
  status: 'active' | 'paused' | 'error' | string;
  created_at?: string | null;
};

export type WooStatusResponse = {
  ok: boolean;
  store: WooStore;
  health: {
    status: string;
    status_label: string;
    stale: boolean;
    stale_reason: string | null;
    last_healthcheck_at: string | null;
  };
  queue: {
    queued: number;
    running: number;
    error: number;
    dead: number;
    total: number;
    lag_hint: string;
  };
  webhooks: {
    received_recent: number;
    failed_recent: number;
    last_received_at: string | null;
    stale_minutes: number | null;
  };
  orders: {
    imported_total_seen: number;
    last_imported_at: string | null;
    last_woo_updated_at: string | null;
  };
  map_quality: {
    total: number;
    missing_revo_map: number;
    duplicated_skus: number;
  };
  recommendations: string[];
  recent_errors: Array<{
    code: string;
    hint: string;
    message: string;
    at: string;
  }>;
  webhook_events: Array<{
    id: string;
    process_status: string;
    received_at: string;
    topic: string | null;
    woo_resource_id: number | null;
    last_error: string | null;
    error_code?: string | null;
  }>;
  jobs: Array<{
    id: string;
    type: string;
    status: string;
    attempts: number;
    next_run_at: string | null;
    last_error: string | null;
    created_at: string;
  }>;
  logs: Array<{
    id: string;
    level: string;
    message: string;
    meta: Record<string, unknown> | null;
    created_at: string;
    job_id: string | null;
  }>;
  status_contract: Record<string, unknown>;
};

export type WooProductMapRow = {
  id: string;
  sku: string | null;
  revo_product_id: string | null;
  woo_product_id: number | null;
  woo_variation_id: number | null;
  last_synced_stock_at: string | null;
  last_synced_price_at: string | null;
  updated_at: string | null;
};

function sanitizeMessage(value: unknown): string {
  const text = String(value ?? 'Falha ao processar ação do WooCommerce.');
  return text.slice(0, 500);
}

async function invokeWooAdmin<T>(
  action: WooAdminAction,
  params: {
    empresaId: string;
    storeId?: string;
    payload?: Record<string, unknown>;
  },
): Promise<T> {
  const body = { action, store_id: params.storeId ?? undefined, ...(params.payload ?? {}) };
  const { data, error } = await supabase.functions.invoke('woocommerce-admin', {
    body,
    headers: { 'x-empresa-id': params.empresaId },
  });
  if (error) throw new Error(sanitizeMessage(error.message));
  if (!(data as any)?.ok) {
    const hint = (data as any)?.hint ? ` (${String((data as any).hint)})` : '';
    const base = (data as any)?.error ? String((data as any).error) : 'Ação não concluída';
    throw new Error(`${base}${hint}`.slice(0, 500));
  }
  return data as T;
}

export async function listWooStores(empresaId: string): Promise<WooStore[]> {
  const data = await invokeWooAdmin<{ ok: true; stores: WooStore[] }>('stores.list', { empresaId });
  return Array.isArray(data.stores) ? data.stores : [];
}

export async function bootstrapWooStoresBestEffort(empresaId: string): Promise<void> {
  try {
    await listWooStores(empresaId);
  } catch (e) {
    if (import.meta.env.DEV) {
      const message = e instanceof Error ? e.message : String(e);
      console.debug('[Woo][bootstrapWooStoresBestEffort] failed', { message });
    }
  }
}

export function getWooStoreStatus(empresaId: string, storeId: string): Promise<WooStatusResponse> {
  return invokeWooAdmin<WooStatusResponse>('stores.status', { empresaId, storeId });
}

export function runWooHealthcheck(empresaId: string, storeId: string) {
  return invokeWooAdmin<{ ok: true; status: string; http_status: number; error_code?: string | null; hint?: string | null }>(
    'stores.healthcheck',
    { empresaId, storeId },
  );
}

export function registerWooWebhooks(empresaId: string, storeId: string) {
  return invokeWooAdmin<{ ok: true; delivery_url: string; topics: Array<{ topic: string; id: number | null }> }>(
    'stores.webhooks.register',
    { empresaId, storeId },
  );
}

export function buildWooProductMap(empresaId: string, storeId: string) {
  return invokeWooAdmin<{ ok: true; enqueued_job_id: string | null }>('stores.product_map.build', { empresaId, storeId });
}

export async function listWooProductMap(empresaId: string, storeId: string, limit = 120): Promise<WooProductMapRow[]> {
  const data = await invokeWooAdmin<{ ok: true; rows: WooProductMapRow[] }>('stores.product_map.list', {
    empresaId,
    storeId,
    payload: { limit },
  });
  return Array.isArray(data.rows) ? data.rows : [];
}

export function replayWooOrder(empresaId: string, storeId: string, orderId: number) {
  return invokeWooAdmin<{ ok: true; enqueued_job_id: string | null }>('stores.reconcile.orders', {
    empresaId,
    storeId,
    payload: { order_id: orderId },
  });
}

export function runWooWorkerNow(empresaId: string, storeId: string, limit = 25) {
  return invokeWooAdmin<{ ok: true; worker: Record<string, unknown> }>('stores.worker.run', {
    empresaId,
    storeId,
    payload: { limit },
  });
}

export function forceWooStockSync(empresaId: string, storeId: string, skus: string[]) {
  return invokeWooAdmin<{ ok: true; enqueued_job_id: string | null }>('stores.sync.stock', {
    empresaId,
    storeId,
    payload: { skus },
  });
}

export function forceWooPriceSync(empresaId: string, storeId: string, skus: string[]) {
  return invokeWooAdmin<{ ok: true; enqueued_job_id: string | null }>('stores.sync.price', {
    empresaId,
    storeId,
    payload: { skus },
  });
}

export function pauseWooStore(empresaId: string, storeId: string) {
  return invokeWooAdmin<{ ok: true; status: string }>('stores.pause', { empresaId, storeId });
}

export function unpauseWooStore(empresaId: string, storeId: string) {
  return invokeWooAdmin<{ ok: true; status: string }>('stores.unpause', { empresaId, storeId });
}

export function requeueWooDeadJob(empresaId: string, storeId: string, jobId: string) {
  return invokeWooAdmin<{ ok: true; job_id: string; status: string; worker?: Record<string, unknown> }>('stores.jobs.requeue', {
    empresaId,
    storeId,
    payload: { job_id: jobId },
  });
}
