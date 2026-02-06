import { useQuery } from '@tanstack/react-query';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { logger } from '@/lib/logger';
import { useEmpresaRole } from '@/hooks/useEmpresaRole';

export const PERMISSION_KEYS = {
  all: ['permission'] as const,
  check: (params: { module: string; action: string; empresaId: string; userId: string }) =>
    [...PERMISSION_KEYS.all, 'check', params] as const,
};

/**
 * Checks if the current user has a specific permission.
 * This hook calls a Supabase RPC function and caches the result.
 * @param module The module to check (e.g., 'usuarios').
 * @param action The action to check (e.g., 'manage').
 * @returns A React Query result object. `data` will be true or false.
 */
export function useHasPermission(module: string, action: string) {
  const supabase = useSupabase();
  const { session, userId, activeEmpresaId } = useAuth();
  const empresaRoleQuery = useEmpresaRole();

  const canCheck = !!session && !!userId && !!activeEmpresaId && !!module && !!action && empresaRoleQuery.isFetched;

  const query = useQuery({
    // Include tenant/user in cache key to avoid cross-empresa reuse.
    queryKey: canCheck
      ? PERMISSION_KEYS.check({ module, action, empresaId: activeEmpresaId, userId })
      : PERMISSION_KEYS.all,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('has_permission_for_current_user', {
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
  const data = query.data ?? false;

  return { ...query, isLoading, data };
}
