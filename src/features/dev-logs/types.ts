export type AuditEvent = {
  id: string;
  empresa_id: string | null;
  occurred_at: string;
  source: string;
  table_name: string | null;
  op: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT';
  actor_id: string | null;
  actor_email: string | null;
  pk: Record<string, unknown> | null;
  row_old: Record<string, unknown> | null;
  row_new: Record<string, unknown> | null;
  diff: Record<string, { old: unknown; new: unknown }> | null;
  meta: Record<string, unknown> | null;
};

// This type represents the state of the filters in the UI.
// The 'ALL' value is a UI concept and will be normalized to `null` before the API call.
export type LogsFilters = {
  from?: Date | null;
  to?: Date | null;
  source?: (string | 'ALL')[];
  table?: string[];
  op?: ('INSERT' | 'UPDATE' | 'DELETE' | 'SELECT' | 'ALL')[];
  q?: string;
  limit?: number;
};
