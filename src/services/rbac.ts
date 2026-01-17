import { Role, Permission, RolePermission } from '@/features/roles/types';
import { callRpc } from '@/lib/api';

export async function getRoles(): Promise<Role[]> {
  const rows = await callRpc<Role[]>('roles_list');
  return rows ?? [];
}

export async function getAllPermissions(): Promise<Permission[]> {
  const rows = await callRpc<Permission[]>('roles_permissions_list');
  return rows ?? [];
}

export async function getRolePermissions(roleId: string): Promise<RolePermission[]> {
  const rows = await callRpc<RolePermission[]>('roles_role_permissions_list', { p_role_id: roleId });
  return rows ?? [];
}

interface UpdatePayload {
  roleId: string;
  permissionsToAdd: { role_id: string; permission_id: string }[];
  permissionsToRemove: { role_id: string; permission_id: string }[];
}

export async function updateRolePermissions({ roleId, permissionsToAdd, permissionsToRemove }: UpdatePayload): Promise<void> {
  const addIds = [...new Set(permissionsToAdd.map((p) => p.permission_id).filter(Boolean))];
  const removeIds = [...new Set(permissionsToRemove.map((p) => p.permission_id).filter(Boolean))];

  await callRpc('roles_update_role_permissions', {
    p_role_id: roleId,
    p_add_permission_ids: addIds.length > 0 ? addIds : null,
    p_remove_permission_ids: removeIds.length > 0 ? removeIds : null,
  });
}
