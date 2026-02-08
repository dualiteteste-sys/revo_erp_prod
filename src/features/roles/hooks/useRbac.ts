import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as rbacService from '@/services/rbac';
import { useAuth } from '@/contexts/AuthProvider';

export function useRoles() {
  const { session, userId, activeEmpresaId } = useAuth();
  const enabled = !!session && !!userId && !!activeEmpresaId;
  return useQuery({
    queryKey: enabled ? ['rbac', 'roles', activeEmpresaId, userId] : ['rbac', 'roles'],
    queryFn: rbacService.getRoles,
    enabled,
  });
}

export function useAllPermissions() {
  const { session, userId, activeEmpresaId } = useAuth();
  const enabled = !!session && !!userId && !!activeEmpresaId;
  return useQuery({
    queryKey: enabled ? ['rbac', 'permissions', activeEmpresaId, userId] : ['rbac', 'permissions'],
    queryFn: rbacService.getAllPermissions,
    enabled,
  });
}

export function useRolePermissions(roleId: string | null) {
  const { session, userId, activeEmpresaId } = useAuth();
  const enabled = !!session && !!userId && !!activeEmpresaId && !!roleId;
  return useQuery({
    queryKey: enabled ? ['rbac', 'role_permissions', activeEmpresaId, userId, roleId] : ['rbac', 'role_permissions'],
    queryFn: () => rbacService.getRolePermissions(roleId!),
    enabled,
  });
}

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rbacService.updateRolePermissions,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['role_permissions', variables.roleId] });
    },
  });
}
