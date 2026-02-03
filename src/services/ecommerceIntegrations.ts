import { callRpc } from '@/lib/api';

export type EcommerceProvider = 'meli' | 'shopee' | 'woo';

export type EcommerceConnectionConfig = {
  import_orders?: boolean;
  sync_stock?: boolean;
  push_tracking?: boolean;
  safe_mode?: boolean;
  store_url?: string;
  deposito_id?: string;
  base_tabela_preco_id?: string;
  price_percent_default?: number;
  [key: string]: unknown;
};

export type EcommerceConnection = {
  id: string;
  empresa_id: string;
  provider: EcommerceProvider;
  nome: string;
  status: string;
  external_account_id: string | null;
  config: EcommerceConnectionConfig | null;
  last_sync_at: string | null;
  last_error: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EcommerceHealthSummary = {
  pending: number;
  failed_24h: number;
  last_sync_at: string | null;
};

export type EcommerceConnectionDiagnostics = {
  provider: EcommerceProvider;
  has_connection: boolean;
  status: string;
  external_account_id: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  has_token: boolean;
  has_refresh_token: boolean;
  token_expires_at: string | null;
  token_expired: boolean;
  token_expires_soon?: boolean;
  token_expires_in_days?: number | null;
};

export function normalizeEcommerceConfig(value: unknown): EcommerceConnectionConfig {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const import_orders = raw.import_orders === false ? false : true;
  const sync_stock = raw.sync_stock === true;
  const push_tracking = raw.push_tracking === true;
  const safe_mode = raw.safe_mode === false ? false : true;
  return { ...raw, import_orders, sync_stock, push_tracking, safe_mode };
}

export async function listEcommerceConnections(): Promise<EcommerceConnection[]> {
  return callRpc<EcommerceConnection[]>('ecommerce_connections_list', {});
}

export async function upsertEcommerceConnection(params: {
  provider: EcommerceProvider;
  nome: string;
  status?: string | null;
  external_account_id?: string | null;
  config?: EcommerceConnectionConfig | null;
}): Promise<EcommerceConnection> {
  return callRpc<EcommerceConnection>('ecommerce_connections_upsert', {
    p_provider: params.provider,
    p_nome: params.nome,
    p_status: params.status ?? null,
    p_external_account_id: params.external_account_id ?? null,
    p_config: params.config ?? null,
  });
}

export async function updateEcommerceConnectionConfig(connectionId: string, config: EcommerceConnectionConfig): Promise<void> {
  await callRpc('ecommerce_connections_update_config', {
    p_id: connectionId,
    p_config: normalizeEcommerceConfig(config),
  });
}

export async function disconnectEcommerceConnection(connectionId: string): Promise<void> {
  await callRpc('ecommerce_connections_disconnect', { p_id: connectionId });
}

export async function getEcommerceHealthSummary(): Promise<EcommerceHealthSummary> {
  return callRpc<EcommerceHealthSummary>('ecommerce_health_summary', { p_window: null });
}

export async function getEcommerceConnectionDiagnostics(provider: EcommerceProvider): Promise<EcommerceConnectionDiagnostics> {
  return callRpc<EcommerceConnectionDiagnostics>('ecommerce_connection_diagnostics', { p_provider: provider });
}

export async function setWooConnectionSecrets(params: {
  ecommerceId: string;
  consumerKey: string;
  consumerSecret: string;
}): Promise<void> {
  await callRpc('ecommerce_woo_set_secrets', {
    p_ecommerce_id: params.ecommerceId,
    p_consumer_key: params.consumerKey,
    p_consumer_secret: params.consumerSecret,
  });
}
