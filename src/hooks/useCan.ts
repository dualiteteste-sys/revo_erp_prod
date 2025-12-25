import { useHasPermission } from './useHasPermission';

// List of modules based on the seeded permissions in the database
export type PermissionModule = 
  | 'usuarios' 
  | 'roles'
  | 'contas_a_receber' 
  | 'centros_de_custo' 
  | 'produtos' 
  | 'servicos' 
  | 'logs';

export type PermissionAction = 'view' | 'create' | 'update' | 'delete' | 'manage';

/**
 * A simple synchronous hook to check for a permission.
 * It wraps the asynchronous `useHasPermission` hook.
 * @returns `true` if the user has the permission, otherwise `false`.
 * Note: During initial loading, it will return `false`, which may cause a brief flicker in the UI.
 */
export function useCan(module: PermissionModule, action: PermissionAction): boolean {
  const { data: hasPermission, isLoading } = useHasPermission(module, action);

  // During the loading phase, we assume no permission to be on the safe side.
  if (isLoading) {
    return false;
  }

  return hasPermission ?? false;
}
