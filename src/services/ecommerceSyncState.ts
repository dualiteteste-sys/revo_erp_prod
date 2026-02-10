import { callRpc } from '@/lib/api';
import type { MarketplaceConflictPolicy, MarketplaceProvider, MarketplaceSyncDirection } from '@/services/marketplaceFramework';

export type EcommerceSyncState = {
  id: string;
  ecommerce_id: string;
  provider: MarketplaceProvider;
  entity: string;
  direction: MarketplaceSyncDirection;
  conflict_policy: MarketplaceConflictPolicy;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  cursor: Record<string, unknown> | null;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  updated_at: string;
};

export async function listEcommerceSyncState(provider?: MarketplaceProvider | null): Promise<EcommerceSyncState[]> {
  return callRpc<EcommerceSyncState[]>('ecommerce_sync_state_list', {
    p_provider: provider ?? null,
  });
}

export async function upsertEcommerceSyncState(params: {
  ecommerceId: string;
  entity: string;
  direction?: MarketplaceSyncDirection | null;
  conflictPolicy?: MarketplaceConflictPolicy | null;
  autoSyncEnabled?: boolean | null;
  syncIntervalMinutes?: number | null;
  cursor?: Record<string, unknown> | null;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
}): Promise<EcommerceSyncState> {
  return callRpc<EcommerceSyncState>('ecommerce_sync_state_upsert', {
    p_ecommerce_id: params.ecommerceId,
    p_entity: params.entity,
    p_direction: params.direction ?? null,
    p_conflict_policy: params.conflictPolicy ?? null,
    p_auto_sync_enabled: params.autoSyncEnabled ?? null,
    p_sync_interval_minutes: params.syncIntervalMinutes ?? null,
    p_cursor: params.cursor ?? null,
    p_last_sync_at: params.lastSyncAt ?? null,
    p_last_success_at: params.lastSuccessAt ?? null,
    p_last_error_at: params.lastErrorAt ?? null,
    p_last_error: params.lastError ?? null,
  });
}
