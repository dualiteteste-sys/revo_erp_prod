import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as rbacService from '@/services/rbac';

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: rbacService.getRoles,
  });
}

export function useAllPermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: rbacService.getAllPermissions,
  });
}

export function useRolePermissions(roleId: string | null) {
  return useQuery({
    queryKey: ['role_permissions', roleId],
    queryFn: () => rbacService.getRolePermissions(roleId!),
    enabled: !!roleId,
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
