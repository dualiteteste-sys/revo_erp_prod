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
  const promises = [];

  if (permissionsToRemove.length > 0) {
    const removePromise = supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)
      .in('permission_id', permissionsToRemove.map(p => p.permission_id));
    promises.push(removePromise);
  }

  if (permissionsToAdd.length > 0) {
    const addPromise = supabase
      .from('role_permissions')
      .insert(permissionsToAdd);
    promises.push(addPromise);
  }

  const results = await Promise.all(promises);
  const firstError = results.find(res => res.error);

  if (firstError?.error) {
    throw firstError.error;
  }
}
