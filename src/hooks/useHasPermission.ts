import { useQuery } from '@tanstack/react-query';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';

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

  const isEnabled = !!session; // Only run the query if the user is logged in

  return useQuery({
    queryKey: ['permission', module, action],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('has_permission_for_current_user', {
        p_module: module,
        p_action: action,
      });
      if (error) {
        console.error(`Error checking permission for ${module}.${action}:`, error);
        // Return false on error to fail safely
        return false;
      }
      return data;
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
