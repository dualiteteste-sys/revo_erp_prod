import { supabase } from '@/lib/supabaseClient';
import { Role, Permission, RolePermission } from '@/features/roles/types';

export async function getRoles(): Promise<Role[]> {
  const { data, error } = await supabase.from('roles').select('*').order('precedence', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getAllPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase.from('permissions').select('*').order('module').order('action');
  if (error) throw error;
  return data;
}

export async function getRolePermissions(roleId: string): Promise<RolePermission[]> {
  const { data, error } = await supabase.from('role_permissions').select('*').eq('role_id', roleId);
  if (error) throw error;
  return data;
}

interface UpdatePayload {
  roleId: string;
  permissionsToAdd: { role_id: string; permission_id: string }[];
  permissionsToRemove: { role_id: string; permission_id: string }[];
}

export async function updateRolePermissions({ roleId, permissionsToAdd, permissionsToRemove }: UpdatePayload): Promise<void> {
  const toAdd = permissionsToAdd.map(p => p.permission_id);
  const toRemove = permissionsToRemove.map(p => p.permission_id);

  const { error } = await supabase.rpc('manage_role_permissions', {
    p_role_id: roleId,
    p_permissions_to_add: toAdd,
    p_permissions_to_remove: toRemove,
  });

  if (error) throw error;
}
