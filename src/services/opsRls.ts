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

