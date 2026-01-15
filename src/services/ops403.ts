import { callRpc } from '@/lib/api';

export type Ops403EventRow = {
  id: string;
  created_at: string;
  empresa_id: string | null;
  user_id: string | null;
  request_id: string | null;
  route: string | null;
  rpc_fn: string | null;
  code: string | null;
  message: string;
  resolved: boolean;
  kind?: string | null;
  plano_mvp?: string | null;
  role?: string | null;
  recovery_attempted?: boolean;
  recovery_ok?: boolean;
};

export async function listOps403Events(params: {
  q?: string | null;
  onlyOpen?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Ops403EventRow[]> {
  return callRpc<Ops403EventRow[]>('ops_403_events_list', {
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_only_open: params.onlyOpen ?? true,
    p_q: params.q ?? null,
  });
}

export async function countOps403Events(params: { q?: string | null; onlyOpen?: boolean }): Promise<number> {
  const res = await callRpc<number>('ops_403_events_count', {
    p_only_open: params.onlyOpen ?? true,
    p_q: params.q ?? null,
  });
  return Number(res ?? 0);
}

export async function setOps403EventResolved(id: string, resolved: boolean) {
  await callRpc('ops_403_events_set_resolved', { p_id: id, p_resolved: resolved });
}

export type Ops403TopKindRow = {
  kind: string;
  total: number;
  last_at: string;
};

export type Ops403TopRpcRow = {
  rpc_fn: string;
  total: number;
  last_at: string;
  kinds: Record<string, number> | null;
};

export async function topOps403Kinds(params: { limit?: number; onlyOpen?: boolean }): Promise<Ops403TopKindRow[]> {
  return callRpc<Ops403TopKindRow[]>('ops_403_events_top_kind', {
    p_limit: params.limit ?? 8,
    p_only_open: params.onlyOpen ?? true,
  });
}

export async function topOps403Rpcs(params: { limit?: number; onlyOpen?: boolean }): Promise<Ops403TopRpcRow[]> {
  return callRpc<Ops403TopRpcRow[]>('ops_403_events_top_rpc', {
    p_limit: params.limit ?? 12,
    p_only_open: params.onlyOpen ?? true,
  });
}

export async function exportOps403Sample(params: { limit?: number; onlyOpen?: boolean } = {}): Promise<any[]> {
  const res = await callRpc<any>('ops_403_events_export_sample', {
    p_limit: params.limit ?? 10,
    p_only_open: params.onlyOpen ?? true,
  });
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return [];
}
