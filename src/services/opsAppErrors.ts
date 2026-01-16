import { callRpc } from "@/lib/api";

export type OpsAppErrorRow = {
  id: string;
  created_at: string;
  empresa_id: string | null;
  user_id: string | null;
  source: string;
  route: string | null;
  last_action: string | null;
  message: string;
  request_id: string | null;
  url: string | null;
  method: string | null;
  http_status: number | null;
  code: string | null;
  response_text: string | null;
  fingerprint: string | null;
  resolved: boolean;
};

export async function listOpsAppErrors(params: {
  q?: string | null;
  source?: string | null;
  onlyOpen?: boolean;
  limit?: number;
  offset?: number;
}): Promise<OpsAppErrorRow[]> {
  return callRpc<OpsAppErrorRow[]>("ops_app_errors_list", {
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_only_open: params.onlyOpen ?? true,
    p_q: params.q ?? null,
    p_source: params.source ?? null,
  });
}

export async function countOpsAppErrors(params: {
  q?: string | null;
  source?: string | null;
  onlyOpen?: boolean;
}): Promise<number> {
  const res = await callRpc<number>("ops_app_errors_count", {
    p_only_open: params.onlyOpen ?? true,
    p_q: params.q ?? null,
    p_source: params.source ?? null,
  });
  return Number(res ?? 0);
}

export async function setOpsAppErrorResolved(id: string, resolved: boolean) {
  await callRpc("ops_app_errors_set_resolved", { p_id: id, p_resolved: resolved });
}

