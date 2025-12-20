import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthProvider';
import { logger } from '@/lib/logger';

export type EmpresaRole = 'owner' | 'admin' | 'member' | 'viewer';

const precedence: Record<EmpresaRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export function roleAtLeast(role: string | null | undefined, min: EmpresaRole): boolean {
  const normalized = (role || '').toLowerCase() as EmpresaRole;
  if (!(normalized in precedence)) return false;
  return precedence[normalized] >= precedence[min];
}

export function useEmpresaRole() {
  const { userId, activeEmpresaId, session } = useAuth();

  return useQuery({
    queryKey: ['empresa-role', activeEmpresaId, userId],
    enabled: !!session && !!activeEmpresaId && !!userId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EmpresaRole | null> => {
      if (!activeEmpresaId || !userId) return null;

      const { data, error } = await supabase
        .from('empresa_usuarios')
        .select('role')
        .eq('empresa_id', activeEmpresaId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        logger.warn('[RBAC] Falha ao carregar role da empresa', error, { activeEmpresaId, userId });
        return null;
      }

      const role = (data as any)?.role as string | null | undefined;
      const normalized = (role || '').toLowerCase() as EmpresaRole;
      if (!normalized || !(normalized in precedence)) return null;
      return normalized;
    },
  });
}

