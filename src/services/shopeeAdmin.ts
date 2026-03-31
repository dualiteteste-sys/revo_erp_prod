import { supabase } from '@/lib/supabaseClient';
import { callRpc } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShopeeAdminAction =
  | 'account.info'
  | 'health.check'
  | 'sync.stock'
  | 'sync.stock.batch'
  | 'sync.price'
  | 'sync.price.batch';

export type ShopeeAccountInfo = {
  shop_name?: string;
  shop_id?: number;
  region?: string;
  status?: string;
};

export type ShopeeHealthCheck = {
  ok: boolean;
  api_status: 'connected' | 'error';
  shop: ShopeeAccountInfo | null;
  health: {
    pending: number;
    failed_24h: number;
    last_sync_at: string | null;
  } | null;
};

export type ShopeeOrderRow = {
  pedido_id: string;
  numero: number | null;
  cliente_nome: string | null;
  status: string;
  total_geral: number;
  data_emissao: string;
  external_order_id: string;
  shopee_status: string | null;
  imported_at: string;
};

// ---------------------------------------------------------------------------
// Invoke helper
// ---------------------------------------------------------------------------

function sanitizeError(error: unknown): string {
  return String(error ?? 'Falha ao processar integração Shopee.').slice(0, 500);
}

async function invoke<T>(action: ShopeeAdminAction, params: {
  empresaId: string;
  ecommerceId: string;
  payload?: Record<string, unknown>;
}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('shopee-admin', {
    body: {
      action,
      ecommerce_id: params.ecommerceId,
      ...(params.payload ?? {}),
    },
    headers: {
      'x-empresa-id': params.empresaId,
    },
  });
  if (error) throw new Error(sanitizeError(error.message));
  if (!(data as any)?.ok) {
    const message = String((data as any)?.error ?? 'Ação Shopee não concluída.');
    throw new Error(message.slice(0, 500));
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export function getShopeeAccountInfo(empresaId: string, ecommerceId: string) {
  return invoke<{ ok: true; data: ShopeeAccountInfo }>('account.info', {
    empresaId,
    ecommerceId,
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export function getShopeeHealthCheck(empresaId: string, ecommerceId: string) {
  return invoke<ShopeeHealthCheck>('health.check', {
    empresaId,
    ecommerceId,
  });
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export function syncShopeeStock(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<{ ok: true; qty: number }>('sync.stock', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function syncShopeePrice(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<{ ok: true; price: number }>('sync.price', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function batchSyncShopeeStock(empresaId: string, ecommerceId: string, anuncioIds: string[]) {
  return invoke<{ ok: true; updated: number; failed: number }>('sync.stock.batch', {
    empresaId,
    ecommerceId,
    payload: { anuncio_ids: anuncioIds },
  });
}

export function batchSyncShopeePrice(empresaId: string, ecommerceId: string, anuncioIds: string[]) {
  return invoke<{ ok: true; updated: number; failed: number }>('sync.price.batch', {
    empresaId,
    ecommerceId,
    payload: { anuncio_ids: anuncioIds },
  });
}

// ---------------------------------------------------------------------------
// Orders (via RPC — same pattern as meliCategories.ts)
// ---------------------------------------------------------------------------

export async function listShopeeOrders(params?: {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ShopeeOrderRow[]> {
  return callRpc<ShopeeOrderRow[]>('shopee_orders_list', {
    p_q: params?.q || null,
    p_status: params?.status || null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  });
}
