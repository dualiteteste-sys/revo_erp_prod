import { callRpc } from '@/lib/api';

export type OpsRlsInventoryRow = {
  schema_name: string;
  table_name: string;
  rls_enabled: boolean;
  has_empresa_id: boolean;
  has_current_empresa_policy: boolean;
  policies_count: number;
  grants_select: boolean;
  grants_insert: boolean;
  grants_update: boolean;
  grants_delete: boolean;
};

export async function listOpsRlsInventory(params: { q?: string | null; limit?: number; offset?: number } = {}) {
  return callRpc<OpsRlsInventoryRow[]>('ops_rls_inventory_list', {
    p_q: params.q ?? null,
    p_limit: params.limit ?? 200,
    p_offset: params.offset ?? 0,
  });
}

export type OpsRlsInventorySnapshotRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  label: string | null;
  meta: Record<string, unknown>;
  high_count: number;
  medium_count: number;
  ok_count: number;
};

export type OpsRlsInventorySnapshotFull = OpsRlsInventorySnapshotRow & {
  rows: Array<OpsRlsInventoryRow & { risk?: 'high' | 'medium' | 'ok' }>;
};

export async function listOpsRlsInventorySnapshots(params: { limit?: number; offset?: number } = {}) {
  return callRpc<OpsRlsInventorySnapshotRow[]>('ops_rls_inventory_snapshots_list', {
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
}

export async function createOpsRlsInventorySnapshot(params: { label?: string | null; meta?: Record<string, unknown> } = {}) {
  return callRpc<string>('ops_rls_inventory_snapshot_create', {
    p_label: params.label ?? null,
    p_meta: params.meta ?? {},
  });
}

export async function getOpsRlsInventorySnapshot(params: { id: string }) {
  const rows = await callRpc<OpsRlsInventorySnapshotFull[]>('ops_rls_inventory_snapshot_get', { p_id: params.id });
  return rows?.[0] ?? null;
}
