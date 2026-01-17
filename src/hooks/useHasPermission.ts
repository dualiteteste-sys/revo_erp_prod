import { useQuery } from '@tanstack/react-query';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';
import { logger } from '@/lib/logger';

/**
 * Checks if the current user has a specific permission.
 * This hook calls a Supabase RPC function and caches the result.
 * @param module The module to check (e.g., 'usuarios').
 * @param action The action to check (e.g., 'manage').
 * @returns A React Query result object. `data` will be true or false.
 */
export function useHasPermission(module: string, action: string) {
  const supabase = useSupabase();
  const { session } = useAuth();
  const empresaRoleQuery = useEmpresaRole();
  const isAdminLike = empresaRoleQuery.isFetched && roleAtLeast(empresaRoleQuery.data, 'admin');
  const isOpsModule = module === 'ops' || module.startsWith('ops:') || module.startsWith('ops_');

  const canCheck = !!session && !!module && !!action && empresaRoleQuery.isFetched;

  const query = useQuery({
    queryKey: ['permission', module, action, isAdminLike],
    queryFn: async () => {
      // Estado da arte:
      // - Admin/Owner tem permissão ampla dentro do tenant
      // - "ops/*" é reservado para usuários internos (não deve ser liberado só por ser admin/owner)
      if (isAdminLike && !isOpsModule) return true;
      const { data, error } = await supabase.rpc('has_permission_for_current_user', {
        p_module: module,
        p_action: action,
      });
      if (error) {
        logger.warn('[RBAC] Falha ao checar permissão', { module, action, error });
        // Return false on error to fail safely
        return false;
      }
      return !!data;
    },
    enabled: canCheck,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Evita "flicker" e regressões: enquanto o role não está resolvido, tratamos como loading.
  const isLoading = !empresaRoleQuery.isFetched || query.isLoading;
  const data = isAdminLike && !isOpsModule ? true : (query.data ?? false);

  return { ...query, isLoading, data };
}
