import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { callRpc } from '@/lib/api';
import ResizableSortableTh from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

type PermissionRow = {
  id: string;
  module: string;
  action: 'view' | 'create' | 'update' | 'delete' | 'manage' | 'export';
};

type OverrideRow = {
  empresa_id: string;
  user_id: string;
  permission_id: string;
  allow: boolean;
};

const ACTIONS: PermissionRow['action'][] = ['view', 'create', 'update', 'delete', 'manage', 'export'];
const ACTION_LABEL: Record<PermissionRow['action'], string> = {
  view: 'Ver',
  create: 'Criar',
  update: 'Editar',
  delete: 'Excluir',
  manage: 'Gerenciar',
  export: 'Exportar',
};

export default function UserPermissionOverrides({ userId }: { userId: string }) {
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const empresaId = activeEmpresa?.id;
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const columns: TableColumnWidthDef[] = [
    { id: 'module', defaultWidth: 240, minWidth: 200 },
    ...ACTIONS.map((a) => ({ id: a, defaultWidth: 150, minWidth: 140, maxWidth: 220 })),
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: `users:permission-overrides:${userId}`, columns });

  const permissionsQuery = useQuery({
    queryKey: ['rbac', 'permissions', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const rows = await callRpc<PermissionRow[]>('roles_permissions_list');
      return (rows || []).map((p) => ({ id: p.id, module: p.module, action: p.action as PermissionRow['action'] }));
    },
  });

  const overridesQuery = useQuery({
    queryKey: ['rbac', 'overrides', empresaId, userId],
    enabled: !!empresaId && !!userId,
    queryFn: async () => {
      const rows = await callRpc<OverrideRow[]>('user_permission_overrides_list_for_current_empresa', { p_user_id: userId });
      return (rows || []) as OverrideRow[];
    },
  });

  const overridesByPermission = useMemo(() => {
    const map = new Map<string, boolean>();
    (overridesQuery.data || []).forEach((o) => map.set(o.permission_id, !!o.allow));
    return map;
  }, [overridesQuery.data]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Map<PermissionRow['action'], PermissionRow>>();
    (permissionsQuery.data || []).forEach((p) => {
      if (!groups.has(p.module)) groups.set(p.module, new Map());
      groups.get(p.module)!.set(p.action, p);
    });
    return Array.from(groups.entries()).map(([module, actions]) => ({ module, actions }));
  }, [permissionsQuery.data]);

  const setOverride = async (permissionId: string, allow: boolean) => {
    if (!empresaId) return;
    setSavingKey(permissionId);
    try {
      await callRpc('user_permission_overrides_upsert_for_current_empresa', {
        p_user_id: userId,
        p_permission_id: permissionId,
        p_allow: allow,
      });
      await overridesQuery.refetch();
      addToast('Permissão específica atualizada.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar permissão específica.', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const clearOverride = async (permissionId: string) => {
    if (!empresaId) return;
    const previous = overridesByPermission.has(permissionId) ? overridesByPermission.get(permissionId)! : null;
    setSavingKey(permissionId);
    try {
      await callRpc('user_permission_overrides_delete_for_current_empresa', {
        p_user_id: userId,
        p_permission_id: permissionId,
      });
      await overridesQuery.refetch();
      addToast('Permissão específica removida.', 'success', previous === null ? undefined : {
        title: 'Ação concluída',
        durationMs: 8000,
        action: {
          label: 'Desfazer',
          ariaLabel: 'Desfazer remoção da permissão específica',
          onClick: async () => {
            await callRpc('user_permission_overrides_upsert_for_current_empresa', {
              p_user_id: userId,
              p_permission_id: permissionId,
              p_allow: previous,
            });
            await overridesQuery.refetch();
            addToast('Permissão específica restaurada.', 'success');
          },
        },
      });
    } catch (e: any) {
      addToast(e?.message || 'Erro ao limpar permissão específica.', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  if (!empresaId) {
    return <div className="text-sm text-gray-500">Nenhuma empresa ativa encontrada.</div>;
  }

  if (permissionsQuery.isLoading || overridesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (permissionsQuery.isError || overridesQuery.isError) {
    return (
      <div className="text-sm text-red-600">
        Falha ao carregar permissões específicas.
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="text-sm text-gray-600">
        Nenhuma permissão disponível para override. Em geral isso acontece quando o usuário atual não tem <strong>roles:manage</strong> ou o RBAC está inconsistente.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">
        Ajuste pontual de permissões (sobrescreve o papel do usuário). Use com parcimônia.
      </div>

      <div className="overflow-auto border border-gray-200 rounded-lg">
        <table className="min-w-[820px] w-full text-sm table-fixed">
          <TableColGroup columns={columns} widths={widths} />
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <ResizableSortableTh
                columnId="module"
                label="Módulo"
                sortable={false}
                resizable
                onResizeStart={startResize}
                className="text-left p-3"
              />
              {ACTIONS.map((a) => (
                <ResizableSortableTh
                  key={a}
                  columnId={a}
                  label={ACTION_LABEL[a]}
                  sortable={false}
                  resizable
                  onResizeStart={startResize}
                  align="center"
                  className="text-center p-3"
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {grouped.map(({ module, actions }) => (
              <tr key={module} className="hover:bg-gray-50/50">
                <td className="p-3 font-medium text-gray-800">{module}</td>
                {ACTIONS.map((action) => {
                  const perm = actions.get(action);
                  if (!perm) return <td key={action} className="p-3 text-center text-gray-300">—</td>;

                  const override = overridesByPermission.has(perm.id) ? overridesByPermission.get(perm.id)! : null;
                  const isSaving = savingKey === perm.id;
                  const value = override === null ? 'inherit' : override ? 'allow' : 'deny';

                  return (
                    <td key={action} className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <select
                          aria-label={`${module}-${action}-override`}
                          value={value}
                          disabled={isSaving}
                          onChange={async (event) => {
                            const next = event.target.value;
                            if (next === 'allow') {
                              await setOverride(perm.id, true);
                              return;
                            }
                            if (next === 'deny') {
                              await setOverride(perm.id, false);
                              return;
                            }
                            if (override !== null) {
                              await clearOverride(perm.id);
                            }
                          }}
                          className={`h-9 min-w-[126px] rounded-md border px-2 text-sm font-semibold transition-colors
                            ${value === 'allow' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''}
                            ${value === 'deny' ? 'border-red-300 bg-red-50 text-red-700' : ''}
                            ${value === 'inherit' ? 'border-gray-300 bg-white text-gray-700' : ''}
                            disabled:opacity-60`}
                        >
                          <option value="inherit">Herdar</option>
                          <option value="allow">Permitir</option>
                          <option value="deny">Negar</option>
                        </select>
                        {isSaving && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
