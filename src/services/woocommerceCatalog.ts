import { supabase } from '@/lib/supabaseClient';

type WooCatalogAction =
  | 'stores.products.search'
  | 'stores.catalog.preview.export'
  | 'stores.catalog.run.export'
  | 'stores.catalog.preview.sync_price'
  | 'stores.catalog.run.sync_price'
  | 'stores.catalog.preview.sync_stock'
  | 'stores.catalog.run.sync_stock'
  | 'stores.catalog.preview.import'
  | 'stores.catalog.run.import'
  | 'stores.runs.get'
  | 'stores.runs.list'
  | 'stores.runs.retry_failed'
  | 'stores.worker.run'
  | 'stores.listings.by_products'
  | 'stores.listings.by_product'
  | 'stores.listings.link_by_sku'
  | 'stores.listings.unlink';

export type WooListingStatus = 'linked' | 'unlinked' | 'conflict' | 'error';

export type WooListingRow = {
  id: string;
  revo_product_id: string;
  sku: string | null;
  woo_product_id: number | null;
  woo_variation_id: number | null;
  listing_status: WooListingStatus;
  last_sync_price_at: string | null;
  last_sync_stock_at: string | null;
  last_error_code: string | null;
  last_error_hint: string | null;
  updated_at: string | null;
};

export type WooCatalogPreviewItem = {
  sku: string | null;
  revo_product_id: string | null;
  woo_product_id: number | null;
  woo_variation_id: number | null;
  action: 'CREATE' | 'UPDATE' | 'SKIP' | 'BLOCK';
  warnings: string[];
  blockers: string[];
  diff: Record<string, unknown>;
};

export type WooCatalogPreviewResponse = {
  ok: true;
  mode: 'EXPORT' | 'IMPORT' | 'SYNC_PRICE' | 'SYNC_STOCK';
  summary: {
    create: number;
    update: number;
    skip: number;
    block: number;
  };
  items: WooCatalogPreviewItem[];
};

export type WooCatalogRunStatus = 'queued' | 'running' | 'done' | 'error' | 'partial' | 'canceled';

export type WooCatalogRun = {
  id: string;
  type: 'EXPORT' | 'IMPORT' | 'SYNC_PRICE' | 'SYNC_STOCK';
  status: WooCatalogRunStatus;
  summary: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

export type WooCatalogRunItem = {
  id: string;
  sku: string | null;
  revo_product_id: string | null;
  woo_product_id: number | null;
  woo_variation_id: number | null;
  action: 'CREATE' | 'UPDATE' | 'SKIP' | 'BLOCK';
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'ERROR' | 'DEAD' | 'SKIPPED';
  error_code: string | null;
  hint: string | null;
  last_error: string | null;
  last_error_at: string | null;
  diff: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WooWorkerRunResponse = {
  ok: true;
  worker: unknown;
};

function sanitizeError(error: unknown) {
  return String(error ?? 'Falha ao processar integração WooCommerce.').slice(0, 500);
}

async function invoke<T>(action: WooCatalogAction, params: {
  empresaId: string;
  storeId: string;
  payload?: Record<string, unknown>;
}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('woocommerce-admin', {
    body: {
      action,
      store_id: params.storeId,
      ...(params.payload ?? {}),
    },
    headers: {
      'x-empresa-id': params.empresaId,
    },
  });
  if (error) throw new Error(sanitizeError(error.message));
  if (!(data as any)?.ok) {
    const message = String((data as any)?.error ?? 'Ação WooCommerce não concluída.');
    const hint = (data as any)?.hint ? ` (${String((data as any)?.hint)})` : '';
    throw new Error(`${message}${hint}`.slice(0, 500));
  }
  return data as T;
}

export async function listWooListingsByProducts(params: {
  empresaId: string;
  storeId: string;
  revoProductIds: string[];
}): Promise<WooListingRow[]> {
  if (params.revoProductIds.length === 0) return [];
  const data = await invoke<{ ok: true; rows: WooListingRow[] }>('stores.listings.by_products', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { revo_product_ids: params.revoProductIds },
  });
  return Array.isArray(data.rows) ? data.rows : [];
}

export function getWooListingByProduct(params: {
  empresaId: string;
  storeId: string;
  revoProductId: string;
}) {
  return invoke<{ ok: true; listing: WooListingRow | null }>('stores.listings.by_product', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { revo_product_id: params.revoProductId },
  });
}

export function linkWooListingBySku(params: {
  empresaId: string;
  storeId: string;
  revoProductId: string;
  sku: string;
}) {
  return invoke<{ ok: true; status: WooListingStatus }>('stores.listings.link_by_sku', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { revo_product_id: params.revoProductId, sku: params.sku },
  });
}

export function unlinkWooListing(params: {
  empresaId: string;
  storeId: string;
  revoProductId: string;
}) {
  return invoke<{ ok: true; status: WooListingStatus }>('stores.listings.unlink', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { revo_product_id: params.revoProductId },
  });
}

export function previewWooExport(params: {
  empresaId: string;
  storeId: string;
  revoProductIds: string[];
  options?: Record<string, unknown>;
}) {
  return invoke<WooCatalogPreviewResponse>('stores.catalog.preview.export', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: {
      revo_product_ids: params.revoProductIds,
      options: params.options ?? {},
    },
  });
}

export function previewWooSyncPrice(params: {
  empresaId: string;
  storeId: string;
  revoProductIds: string[];
}) {
  return invoke<WooCatalogPreviewResponse>('stores.catalog.preview.sync_price', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { revo_product_ids: params.revoProductIds },
  });
}

export function previewWooSyncStock(params: {
  empresaId: string;
  storeId: string;
  revoProductIds: string[];
}) {
  return invoke<WooCatalogPreviewResponse>('stores.catalog.preview.sync_stock', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { revo_product_ids: params.revoProductIds },
  });
}

export function runWooExport(params: {
  empresaId: string;
  storeId: string;
  revoProductIds: string[];
  options?: Record<string, unknown>;
}) {
  return invoke<{ ok: true; run_id: string; enqueued_job_id: string | null; summary: WooCatalogPreviewResponse['summary']; worker?: unknown | null }>('stores.catalog.run.export', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: {
      revo_product_ids: params.revoProductIds,
      options: params.options ?? {},
    },
  });
}

export function runWooSyncPrice(params: {
  empresaId: string;
  storeId: string;
  revoProductIds: string[];
}) {
  return invoke<{ ok: true; run_id: string; enqueued_job_id: string | null; summary: WooCatalogPreviewResponse['summary']; worker?: unknown | null }>('stores.catalog.run.sync_price', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { revo_product_ids: params.revoProductIds },
  });
}

export function runWooSyncStock(params: {
  empresaId: string;
  storeId: string;
  revoProductIds: string[];
}) {
  return invoke<{ ok: true; run_id: string; enqueued_job_id: string | null; summary: WooCatalogPreviewResponse['summary']; worker?: unknown | null }>('stores.catalog.run.sync_stock', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { revo_product_ids: params.revoProductIds },
  });
}

export function searchWooCatalogProducts(params: {
  empresaId: string;
  storeId: string;
  query: string;
  page?: number;
  perPage?: number;
}) {
  return invoke<{ ok: true; rows: Array<{ id: number; name: string | null; sku: string | null; type: string; status: string | null; price: string | null; stock_status: string | null; updated_at: string | null }> }>('stores.products.search', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: {
      query: params.query,
      page: params.page ?? 1,
      per_page: params.perPage ?? 50,
    },
  });
}

export function previewWooImport(params: {
  empresaId: string;
  storeId: string;
  wooProductIds: number[];
}) {
  return invoke<WooCatalogPreviewResponse>('stores.catalog.preview.import', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { woo_product_ids: params.wooProductIds },
  });
}

export function runWooImport(params: {
  empresaId: string;
  storeId: string;
  wooProductIds: number[];
}) {
  return invoke<{ ok: true; run_id: string; enqueued_job_id: string | null; summary: WooCatalogPreviewResponse['summary']; worker?: unknown | null }>('stores.catalog.run.import', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { woo_product_ids: params.wooProductIds },
  });
}

export function runWooWorkerNow(params: {
  empresaId: string;
  storeId: string;
  limit?: number;
}) {
  return invoke<WooWorkerRunResponse>('stores.worker.run', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { limit: params.limit ?? 25 },
  });
}

export function listWooRuns(params: { empresaId: string; storeId: string; limit?: number }) {
  return invoke<{ ok: true; runs: WooCatalogRun[] }>('stores.runs.list', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { limit: params.limit ?? 30 },
  });
}

export function getWooRun(params: { empresaId: string; storeId: string; runId: string }) {
  return invoke<{ ok: true; run: WooCatalogRun; items: WooCatalogRunItem[] }>('stores.runs.get', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { run_id: params.runId },
  });
}

export function retryWooRunFailed(params: { empresaId: string; storeId: string; runId: string }) {
  return invoke<{ ok: true; run_id: string; source_run_id: string; enqueued_job_id: string | null; retried_items: number }>('stores.runs.retry_failed', {
    empresaId: params.empresaId,
    storeId: params.storeId,
    payload: { run_id: params.runId },
  });
}
