import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShieldCheck, ShieldX, MinusCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
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
    ...ACTIONS.map((a) => ({ id: a, defaultWidth: 120, minWidth: 110, maxWidth: 240 })),
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: `users:permission-overrides:${userId}`, columns });

  const permissionsQuery = useQuery({
    queryKey: ['rbac', 'permissions'],
    queryFn: async () => {
      const rows = await callRpc<PermissionRow[]>('roles_permissions_list');
      return (rows || []).map((p) => ({ id: p.id, module: p.module, action: p.action as PermissionRow['action'] }));
    },
  });

  const overridesQuery = useQuery({
    queryKey: ['rbac', 'overrides', empresaId, userId],
    enabled: !!empresaId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permission_overrides')
        .select('empresa_id,user_id,permission_id,allow')
        .eq('empresa_id', empresaId!)
        .eq('user_id', userId);
      if (error) throw error;
      return (data || []) as OverrideRow[];
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
      const { error } = await supabase
        .from('user_permission_overrides')
        .upsert(
          { empresa_id: empresaId, user_id: userId, permission_id: permissionId, allow },
          { onConflict: 'empresa_id,user_id,permission_id' }
        );
      if (error) throw error;
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
      const { error } = await supabase
        .from('user_permission_overrides')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('user_id', userId)
        .eq('permission_id', permissionId);
      if (error) throw error;
      await overridesQuery.refetch();
      addToast('Permissão específica removida.', 'success', previous === null ? undefined : {
        title: 'Ação concluída',
        durationMs: 8000,
        action: {
          label: 'Desfazer',
          ariaLabel: 'Desfazer remoção da permissão específica',
          onClick: async () => {
            await supabase
              .from('user_permission_overrides')
              .upsert(
                { empresa_id: empresaId, user_id: userId, permission_id: permissionId, allow: previous },
                { onConflict: 'empresa_id,user_id,permission_id' }
              );
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

                  const baseBtn =
                    'inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold transition-colors disabled:opacity-60';
                  const allowActive = override === true;
                  const denyActive = override === false;

                  return (
                    <td key={action} className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => setOverride(perm.id, true)}
                          className={`${baseBtn} ${allowActive ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}
                          title="Permitir"
                        >
                          {isSaving && allowActive ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                          Permitir
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => setOverride(perm.id, false)}
                          className={`${baseBtn} ${denyActive ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-200 hover:bg-red-50'}`}
                          title="Negar"
                        >
                          {isSaving && denyActive ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldX className="h-3 w-3" />}
                          Negar
                        </button>
                        <button
                          type="button"
                          disabled={isSaving || override === null}
                          onClick={() => clearOverride(perm.id)}
                          className={`${baseBtn} bg-white text-gray-700 border-gray-200 hover:bg-gray-50`}
                          title="Voltar ao padrão do papel"
                        >
                          <MinusCircle className="h-3 w-3" />
                          Limpar
                        </button>
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
