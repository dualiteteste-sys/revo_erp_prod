import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthProvider';
import { logger } from '@/lib/logger';
import { callRpc } from '@/lib/api';

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

      const normalize = (value: unknown): EmpresaRole | null => {
        const raw = (String(value || '').toLowerCase() || '').trim();
        const mapped =
          raw === 'finance' || raw === 'financeiro' || raw === 'ops' || raw === 'operador'
            ? 'member'
            : raw === 'readonly' || raw === 'read_only' || raw === 'read-only'
              ? 'viewer'
              : raw;
        const normalized = mapped as EmpresaRole;
        return normalized in precedence ? normalized : null;
      };

      // Fonte preferencial: RPC current_empresa_role() (tenant-safe, evita dependência de schema cache de JOIN).
      try {
        const rpcRole = await callRpc<unknown>('current_empresa_role');
        const normalized = normalize(rpcRole);
        if (normalized) return normalized;
      } catch (rpcError) {
        logger.warn('[RBAC] Falha ao carregar role via RPC current_empresa_role()', rpcError, { activeEmpresaId, userId });
      }
      return null;
    },
  });
}
