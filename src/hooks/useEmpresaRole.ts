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

      // Fonte preferencial: vínculo + join em roles (legado), evita depender do schema cache de RPC.
      const { data: row, error: rowError } = await supabase
        .from('empresa_usuarios')
        .select('role, roles:roles(slug)')
        .eq('empresa_id', activeEmpresaId)
        .eq('user_id', userId)
        .maybeSingle();

      if (rowError) {
        logger.warn('[RBAC] Falha ao carregar role da empresa', rowError, { activeEmpresaId, userId });
        return null;
      }

      const roleText = (row as any)?.role as string | null | undefined;
      const roleSlug = (row as any)?.roles?.slug as string | null | undefined;

      const normalizedText = (roleText || '').toLowerCase() as EmpresaRole;
      const normalizedSlug = (roleSlug || '').toLowerCase() as EmpresaRole;

      const fromText = normalizedText in precedence ? normalizedText : null;
      const fromSlug = normalizedSlug in precedence ? normalizedSlug : null;

      if (!fromText && !fromSlug) return null;
      if (!fromText) return fromSlug;
      if (!fromSlug) return fromText;
      return precedence[fromSlug] > precedence[fromText] ? fromSlug : fromText;
    },
  });
}
