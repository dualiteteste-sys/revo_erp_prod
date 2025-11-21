import React, { useState, useEffect, useMemo } from 'react';
import { useAllPermissions, useRolePermissions, useUpdateRolePermissions } from './hooks/useRbac';
import { Permission, Role } from './types';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { useHasPermission } from '@/hooks/useHasPermission';

interface PermissionsMatrixProps {
  selectedRole: Role | null;
}

type GroupedPermissions = {
  [module: string]: Permission[];
};

const ACTIONS_ORDER: Record<string, number> = { view: 1, create: 2, update: 3, delete: 4, manage: 5 };

export const PermissionsMatrix: React.FC<PermissionsMatrixProps> = ({ selectedRole }) => {
  const { data: allPermissions, isLoading: isLoadingAllPermissions } = useAllPermissions();
  const { data: rolePermissions, isLoading: isLoadingRolePermissions } = useRolePermissions(selectedRole?.id ?? null);
  const updateMutation = useUpdateRolePermissions();
  const { addToast } = useToast();
  const { data: canManageRoles } = useHasPermission('roles', 'manage');

  const [initialPermissionIds, setInitialPermissionIds] = useState<Set<string>>(new Set());
  const [currentPermissionIds, setCurrentPermissionIds] = useState<Set<string>>(new Set());

  const isOwnerRole = selectedRole?.slug === 'OWNER';
  const isFormDisabled = isOwnerRole || !canManageRoles;

  useEffect(() => {
    if (rolePermissions) {
      const ids = new Set(rolePermissions.map(rp => rp.permission_id));
      setInitialPermissionIds(ids);
      setCurrentPermissionIds(ids);
    } else {
      setInitialPermissionIds(new Set());
      setCurrentPermissionIds(new Set());
    }
  }, [rolePermissions, selectedRole]);

  const groupedPermissions = useMemo<GroupedPermissions>(() => {
    if (!allPermissions) return {};
    return allPermissions.reduce((acc, perm) => {
      acc[perm.module] = [...(acc[perm.module] || []), perm].sort((a, b) => (ACTIONS_ORDER[a.action] || 99) - (ACTIONS_ORDER[b.action] || 99));
      return acc;
    }, {} as GroupedPermissions);
  }, [allPermissions]);

  const handleToggle = (permissionId: string) => {
    setCurrentPermissionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  };

  const handleToggleAll = (moduleName: string) => {
    const modulePermissions = groupedPermissions[moduleName].map(p => p.id);
    const allSelected = modulePermissions.every(id => currentPermissionIds.has(id));
    
    setCurrentPermissionIds(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        modulePermissions.forEach(id => newSet.delete(id));
      } else {
        modulePermissions.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const handleSaveChanges = () => {
    if (!selectedRole) return;

    const permissionsToAdd = [...currentPermissionIds]
      .filter(id => !initialPermissionIds.has(id))
      .map(id => ({ role_id: selectedRole.id, permission_id: id }));

    const permissionsToRemove = [...initialPermissionIds]
      .filter(id => !currentPermissionIds.has(id))
      .map(id => ({ role_id: selectedRole.id, permission_id: id }));

    updateMutation.mutate(
      { roleId: selectedRole.id, permissionsToAdd, permissionsToRemove },
      {
        onSuccess: () => {
          addToast('Permissões salvas com sucesso!', 'success');
          setInitialPermissionIds(currentPermissionIds);
        },
        onError: (error) => {
          addToast(`Erro ao salvar: ${error.message}`, 'error');
        },
      }
    );
  };

  const isDirty = useMemo(() => {
    if (initialPermissionIds.size !== currentPermissionIds.size) return true;
    for (const id of initialPermissionIds) {
      if (!currentPermissionIds.has(id)) return true;
    }
    return false;
  }, [initialPermissionIds, currentPermissionIds]);

  if (isLoadingAllPermissions || (selectedRole && isLoadingRolePermissions)) {
    return <div className="flex-1 p-6 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>;
  }

  if (!selectedRole) {
    return <div className="flex-1 p-6 flex items-center justify-center text-gray-500">Selecione um papel para ver as permissões.</div>;
  }

  return (
    <main className="flex-1 p-6 bg-white/40 rounded-2xl overflow-y-auto scrollbar-styled">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{selectedRole.name}</h2>
          <p className="text-gray-600">Gerencie as permissões para este papel.</p>
        </div>
        <Button onClick={handleSaveChanges} disabled={!isDirty || updateMutation.isPending || isFormDisabled}>
          {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Alterações
        </Button>
      </div>

      {isOwnerRole && (
        <div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 rounded-r-lg">
          <div className="flex items-center gap-2">
            <ShieldAlert size={20} />
            <p className="font-semibold">O papel de Proprietário tem acesso total e não pode ser editado.</p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(groupedPermissions).map(([moduleName, permissions]) => {
          const allModulePermissionsSelected = permissions.every(p => currentPermissionIds.has(p.id));
          return (
            <div key={moduleName} className="border rounded-lg p-4 bg-white/80">
              <div className="flex items-center justify-between mb-4 pb-2 border-b">
                <h3 className="text-lg font-semibold capitalize">{moduleName.replace(/_/g, ' ')}</h3>
                <div className="flex items-center gap-2">
                  <label htmlFor={`select-all-${moduleName}`} className="text-sm font-medium">Marcar todos</label>
                  <input
                    id={`select-all-${moduleName}`}
                    type="checkbox"
                    checked={allModulePermissionsSelected}
                    onChange={() => handleToggleAll(moduleName)}
                    disabled={isFormDisabled}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {permissions.map(permission => (
                  <div key={permission.id} className="flex items-center">
                    <input
                      id={permission.id}
                      type="checkbox"
                      checked={currentPermissionIds.has(permission.id)}
                      onChange={() => handleToggle(permission.id)}
                      disabled={isFormDisabled}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={permission.id} className="ml-2 block text-sm text-gray-900 capitalize">{permission.action}</label>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
};
