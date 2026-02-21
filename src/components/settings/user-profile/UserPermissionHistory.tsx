import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { listUserPermissionOverrideHistory, type UserPermissionOverrideHistoryRow } from '@/services/userPermissionHistory';
import { useAuth } from '@/contexts/AuthProvider';

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

function normalizeOperationLabel(value: string): string {
  const op = String(value || '').toUpperCase();
  if (op === 'INSERT') return 'Criado';
  if (op === 'UPDATE') return 'Atualizado';
  if (op === 'DELETE') return 'Removido';
  return op || '—';
}

function normalizePermissionLabel(row: UserPermissionOverrideHistoryRow): string {
  const moduleName = row.permission_module || 'desconhecido';
  const actionName = row.permission_action || 'desconhecido';
  return `${moduleName}:${actionName}`;
}

function normalizeChangedByLabel(row: UserPermissionOverrideHistoryRow, currentUserId: string): string {
  if (row.changed_by === currentUserId) return 'Você';
  if (!row.changed_by) return 'Sistema';
  return `${row.changed_by.slice(0, 8)}…`;
}

export default function UserPermissionHistory({ userId }: { userId: string }) {
  const { activeEmpresaId, userId: currentUserId } = useAuth();

  const historyQuery = useQuery({
    queryKey: ['settings', 'user-profile', 'permission-history', activeEmpresaId, userId],
    enabled: !!activeEmpresaId && !!userId,
    queryFn: async () => listUserPermissionOverrideHistory(userId, 50),
  });

  const historyRows = historyQuery.data || [];

  if (historyQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-gray-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando histórico…
      </div>
    );
  }

  if (historyQuery.isError) {
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
                  <td className="p-3 font-medium text-gray-800">{row.permission_module || 'desconhecido'}</td>
                  <td className="p-3">{row.permission_action || 'desconhecido'}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getBadgeClass(row.before_allow)}`}>
                      {normalizeOverrideLabel(row.before_allow)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getBadgeClass(row.after_allow)}`}>
                      {normalizeOverrideLabel(row.after_allow)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-gray-700">{normalizeChangedByLabel(row, currentUserId || '')}</span>
                      <span className="text-[11px] text-gray-500">{normalizeOperationLabel(row.operation)}</span>
                      <span className="text-[11px] text-gray-500">{normalizePermissionLabel(row)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
