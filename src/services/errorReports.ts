import { supabase } from "@/lib/supabaseClient";

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
  context: any;
  recent_network_errors: any;
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
  const limit = typeof filters.limit === "number" ? filters.limit : 200;
  let query = (supabase as any)
    .from("error_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.statuses?.length) {
    query = query.in("status", filters.statuses);
  }

  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);

  if (filters.onlyMine && filters.userId) {
    query = query.eq("created_by", filters.userId);
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim().replace(/[%_]/g, "\\$&");
    query = query.or(
      `user_message.ilike.%${q}%,user_email.ilike.%${q}%,sentry_event_id.ilike.%${q}%,github_issue_url.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ErrorReportRow[];
}

export async function updateErrorReportStatus(id: string, status: ErrorReportStatus) {
  const { data, error } = await (supabase as any)
    .from("error_reports")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ErrorReportRow;
}

