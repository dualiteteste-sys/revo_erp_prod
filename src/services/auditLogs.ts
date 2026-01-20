import { logger } from '@/lib/logger';
import { callRpc } from '@/lib/api';

export type AuditLogOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export type AuditLogRow = {
  id: string;
  empresa_id: string;
  table_name: string;
  record_id: string | null;
  operation: AuditLogOperation;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
};

export async function listAuditLogsForTables(tables: string[], limit = 300): Promise<AuditLogRow[]> {
  const uniqueTables = Array.from(new Set(tables)).filter(Boolean);
  if (uniqueTables.length === 0) return [];

  try {
    const data = await callRpc<AuditLogRow[]>('audit_logs_list_for_tables', { p_tables: uniqueTables, p_limit: limit });
    return (data ?? []) as AuditLogRow[];
  } catch (error: any) {
    const msg = String(error?.message ?? '');
    const isTransientNetworkError = /(failed to fetch|networkerror|load failed|aborterror)/i.test(msg);
    if (isTransientNetworkError) {
      logger.warn('[AuditLogs] Falha transitória ao listar audit_logs', { message: msg, tables: uniqueTables, limit });
      return [];
    }
    logger.error('[AuditLogs] Falha ao listar audit_logs', error, { tables: uniqueTables, limit });
    throw new Error(msg || 'Falha ao listar audit_logs');
  }
}
