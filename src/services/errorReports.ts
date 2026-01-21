import { callRpc } from "@/lib/api";

export type ErrorReportStatus = "new" | "triaged" | "in_progress" | "resolved" | "ignored";
export type ErrorReportSeverity = "error" | "warning";

export type ErrorReportRow = {
  id: string;
  empresa_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: ErrorReportStatus;
  severity: ErrorReportSeverity;
  user_email: string | null;
  user_message: string;
  url: string | null;
  user_agent: string | null;
  sentry_event_id: string;
  email_ok: boolean;
  email_error: string | null;
  github_ok: boolean;
  github_issue_url: string | null;
  github_error: string | null;
  context: unknown;
  recent_network_errors: unknown;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type ErrorReportsFilters = {
  q?: string;
  statuses?: ErrorReportStatus[];
  from?: string; // ISO
  to?: string; // ISO
  onlyMine?: boolean;
  userId?: string | null;
  limit?: number;
};

export async function listErrorReports(filters: ErrorReportsFilters): Promise<ErrorReportRow[]> {
  return callRpc<ErrorReportRow[]>("ops_error_reports_list", {
    p_q: filters.q?.trim() ? filters.q.trim() : null,
    p_statuses: filters.statuses?.length ? filters.statuses : null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_only_mine: !!filters.onlyMine,
    p_limit: typeof filters.limit === "number" ? filters.limit : 200,
  });
}

export async function updateErrorReportStatus(id: string, status: ErrorReportStatus) {
  return callRpc<ErrorReportRow>("ops_error_reports_set_status", {
    p_id: id,
    p_status: status,
  });
}
