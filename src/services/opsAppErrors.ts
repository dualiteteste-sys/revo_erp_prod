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
  status: "novo" | "investigando" | "corrigido" | "ignorado";
  resolved: boolean;
  resolved_at?: string | null;
  resolved_by?: string | null;
  triage_note?: string | null;
  triage_updated_at?: string | null;
  triage_updated_by?: string | null;
};

export async function listOpsAppErrors(params: {
  q?: string | null;
  source?: string | null;
  onlyOpen?: boolean;
  statuses?: Array<OpsAppErrorRow["status"]> | null;
  from?: string | null; // ISO timestamptz
  to?: string | null; // ISO timestamptz
  limit?: number;
  offset?: number;
}): Promise<OpsAppErrorRow[]> {
  return callRpc<OpsAppErrorRow[]>("ops_app_errors_list", {
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_only_open: params.onlyOpen ?? true,
    p_q: params.q ?? null,
    p_source: params.source ?? null,
    p_statuses: params.statuses?.length ? params.statuses : null,
    p_from: params.from ?? null,
    p_to: params.to ?? null,
  });
}

export async function countOpsAppErrors(params: {
  q?: string | null;
  source?: string | null;
  onlyOpen?: boolean;
  statuses?: Array<OpsAppErrorRow["status"]> | null;
  from?: string | null; // ISO timestamptz
  to?: string | null; // ISO timestamptz
}): Promise<number> {
  const res = await callRpc<number>("ops_app_errors_count", {
    p_only_open: params.onlyOpen ?? true,
    p_q: params.q ?? null,
    p_source: params.source ?? null,
    p_statuses: params.statuses?.length ? params.statuses : null,
    p_from: params.from ?? null,
    p_to: params.to ?? null,
  });
  return Number(res ?? 0);
}

export async function setOpsAppErrorResolved(id: string, resolved: boolean) {
  await callRpc("ops_app_errors_set_resolved", { p_id: id, p_resolved: resolved });
}

export async function setOpsAppErrorStatus(
  id: string,
  status: OpsAppErrorRow["status"],
  note?: string | null,
) {
  await callRpc("ops_app_errors_set_status", { p_id: id, p_status: status, p_note: note ?? null });
}

export async function setOpsAppErrorsStatusMany(
  ids: string[],
  status: OpsAppErrorRow["status"],
  note?: string | null,
) {
  await callRpc("ops_app_errors_set_status_many", {
    p_ids: ids,
    p_status: status,
    p_note: note ?? null,
  });
}
