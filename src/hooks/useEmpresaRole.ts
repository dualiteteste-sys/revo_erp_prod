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

      const normalize = (value: unknown): EmpresaRole | null => {
        const normalized = (String(value || '').toLowerCase() || '') as EmpresaRole;
        return normalized in precedence ? normalized : null;
      };

      const roleText = normalize((row as any)?.role);
      const roleSlug = normalize((row as any)?.roles?.slug);

      const pickBest = (a: EmpresaRole | null, b: EmpresaRole | null) => {
        if (!a && !b) return null;
        if (!a) return b;
        if (!b) return a;
        return precedence[b] > precedence[a] ? b : a;
      };

      // Fallback: RPC current_empresa_role() (útil quando o schema/cache de join está inconsistênte).
      // Isso ajuda a evitar situações onde um usuário "owner/admin" fica bloqueado por erro transitório de schema.
      const tryRpcFallback = async (): Promise<EmpresaRole | null> => {
        const { data, error: rpcError } = await supabase.rpc('current_empresa_role');
        if (rpcError) {
          logger.warn('[RBAC] Falha ao carregar role via RPC current_empresa_role()', rpcError, { activeEmpresaId, userId });
          return null;
        }
        return normalize(data);
      };

      if (rowError) {
        logger.warn('[RBAC] Falha ao carregar role da empresa (join)', rowError, { activeEmpresaId, userId });
        return await tryRpcFallback();
      }

      const bestFromJoin = pickBest(roleText, roleSlug);
      if (bestFromJoin) return bestFromJoin;

      return await tryRpcFallback();
    },
  });
}
