import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

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

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id,empresa_id,table_name,record_id,operation,old_data,new_data,changed_by,changed_at')
    .in('table_name', uniqueTables)
    .order('changed_at', { ascending: false })
    .limit(limit);

  if (error) {
    const msg = String((error as any)?.message ?? '');
    const isTransientNetworkError = /(failed to fetch|networkerror|load failed|aborterror)/i.test(msg);
    if (isTransientNetworkError) {
      logger.warn('[AuditLogs] Falha transitória ao listar audit_logs', { message: msg, tables: uniqueTables, limit });
      return [];
    }
    logger.error('[AuditLogs] Falha ao listar audit_logs', error, { tables: uniqueTables, limit });
    throw new Error(msg || 'Falha ao listar audit_logs');
  }

  return (data || []) as AuditLogRow[];
}
