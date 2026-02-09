import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { callRpc } from '@/lib/api';
import { listAuditLogsForTables, type AuditLogRow } from '@/services/auditLogs';
import { useAuth } from '@/contexts/AuthProvider';

type PermissionRow = {
  id: string;
  module: string;
  action: 'view' | 'create' | 'update' | 'delete' | 'manage' | 'export';
};

type HistoryRow = {
  id: string;
  changed_at: string;
  changed_by: string | null;
  module: string;
  action: string;
  before: boolean | null;
  after: boolean | null;
};

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function normalizeOverrideLabel(value: boolean | null): string {
  if (value === true) return 'Permitir';
  if (value === false) return 'Negar';
  return 'Herdar';
}

function getBadgeClass(value: boolean | null): string {
  if (value === true) return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (value === false) return 'border-red-300 bg-red-50 text-red-700';
  return 'border-gray-300 bg-gray-50 text-gray-700';
}

function buildHistoryRows(logs: AuditLogRow[], permissionsById: Map<string, PermissionRow>, userId: string): HistoryRow[] {
  const rows: HistoryRow[] = [];

  for (const log of logs) {
    const oldData = (log.old_data || {}) as Record<string, unknown>;
    const newData = (log.new_data || {}) as Record<string, unknown>;
    const oldUserId = typeof oldData.user_id === 'string' ? oldData.user_id : null;
    const newUserId = typeof newData.user_id === 'string' ? newData.user_id : null;
    if (oldUserId !== userId && newUserId !== userId) continue;

    const permissionId =
      (typeof newData.permission_id === 'string' ? newData.permission_id : null) ||
      (typeof oldData.permission_id === 'string' ? oldData.permission_id : null);
    if (!permissionId) continue;

    const permission = permissionsById.get(permissionId);
    rows.push({
      id: log.id,
      changed_at: log.changed_at,
      changed_by: log.changed_by,
      module: permission?.module || 'desconhecido',
      action: permission?.action || 'desconhecido',
      before: parseBoolean(oldData.allow),
      after: parseBoolean(newData.allow),
    });
  }

  return rows.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
}

export default function UserPermissionHistory({ userId }: { userId: string }) {
  const { activeEmpresaId } = useAuth();

  const permissionsQuery = useQuery({
    queryKey: ['rbac', 'permissions', activeEmpresaId],
    enabled: !!activeEmpresaId,
    queryFn: async () => {
      const rows = await callRpc<PermissionRow[]>('roles_permissions_list');
      return (rows || []) as PermissionRow[];
    },
  });

  const historyQuery = useQuery({
    queryKey: ['settings', 'user-profile', 'permission-history', activeEmpresaId, userId],
    enabled: !!activeEmpresaId && !!userId,
    queryFn: async () => {
      const logs = await listAuditLogsForTables(['user_permission_overrides'], 200);
      return (logs || []) as AuditLogRow[];
    },
  });

  const historyRows = useMemo(() => {
    const permissionsById = new Map((permissionsQuery.data || []).map((permission) => [permission.id, permission]));
    return buildHistoryRows(historyQuery.data || [], permissionsById, userId).slice(0, 30);
  }, [historyQuery.data, permissionsQuery.data, userId]);

  if (permissionsQuery.isLoading || historyQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-gray-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando histórico…
      </div>
    );
  }

  if (permissionsQuery.isError || historyQuery.isError) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        Não foi possível carregar o histórico de alterações de permissões.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Últimas alterações de overrides para o seu usuário nesta empresa.</p>
        <button
          type="button"
          onClick={() => void historyQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          disabled={historyQuery.isFetching}
        >
          {historyQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </div>

      {historyRows.length === 0 ? (
        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
          Nenhuma alteração de permissões específicas foi encontrada para este usuário.
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 text-left font-semibold">Quando</th>
                <th className="p-3 text-left font-semibold">Módulo</th>
                <th className="p-3 text-left font-semibold">Ação</th>
                <th className="p-3 text-left font-semibold">Antes</th>
                <th className="p-3 text-left font-semibold">Depois</th>
                <th className="p-3 text-left font-semibold">Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {historyRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="p-3 whitespace-nowrap">{new Date(row.changed_at).toLocaleString('pt-BR')}</td>
                  <td className="p-3 font-medium text-gray-800">{row.module}</td>
                  <td className="p-3">{row.action}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getBadgeClass(row.before)}`}>
                      {normalizeOverrideLabel(row.before)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getBadgeClass(row.after)}`}>
                      {normalizeOverrideLabel(row.after)}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-600">{row.changed_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
