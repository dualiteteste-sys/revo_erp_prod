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

