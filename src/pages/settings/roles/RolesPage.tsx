import React, { useState, useMemo, useEffect } from 'react';
import { RolesList } from '@/features/roles/RolesList';
import { PermissionsMatrix } from '@/features/roles/PermissionsMatrix';
import { useRoles } from '@/features/roles/hooks/useRbac';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Loader2, Lock } from 'lucide-react';
import { Role } from '@/features/roles/types';

export default function RolesPage() {
  const { data: canManage, isLoading: isLoadingPermission } = useHasPermission('roles', 'manage');
  const { data: roles, isLoading: isLoadingRoles } = useRoles();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const selectedRole = useMemo(() => {
    return roles?.find(r => r.id === selectedRoleId) ?? null;
  }, [roles, selectedRoleId]);

  // Set initial selection
  useEffect(() => {
    if (!selectedRoleId && roles && roles.length > 0) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  if (isLoadingPermission || isLoadingRoles) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Lock className="h-12 w-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-800">Acesso Negado</h2>
        <p className="text-gray-600 mt-1">Você não tem permissão para gerenciar papéis e permissões.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full gap-4">
      <RolesList selectedRoleId={selectedRoleId} onSelectRole={setSelectedRoleId} />
      <div className="flex-1 overflow-hidden">
        <PermissionsMatrix selectedRole={selectedRole} />
      </div>
    </div>
  );
}
