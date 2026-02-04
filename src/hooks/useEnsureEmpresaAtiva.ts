import { useEffect, useRef } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';

/**
 * Garante empresa ativa para o usuário autenticado.
 * - Idempotente: se já existir preferida, retorna 'already_active'.
 * - Se não houver, cria e seta ativa (usando dados opc. do onboarding).
 * - Persiste empresa_id no localStorage apenas para UX.
 */
export function useEnsureEmpresaAtiva(
  nomeEmpresa?: string,
  fantasiaEmpresa?: string
) {
  const supabase = useSupabase();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        console.warn('[AUTH] Sem sessão. Abortando ensureEmpresaAtiva.');
        return;
      }

      // FIX: Standardized parameter name to p_razao_social to match backend RPC signature
      const { data, error } = await (supabase as any).rpc('bootstrap_empresa_for_current_user', {
        p_razao_social: nomeEmpresa || null,
        p_fantasia: fantasiaEmpresa || null,
      });

      if (error) {
        console.error('[RPC][bootstrap_empresa_for_current_user][ERROR]', error);
        return;
      }

      const empresaId = (data as any)?.[0]?.empresa_id as string | undefined;
      if (empresaId) {
        localStorage.setItem('empresa_id', empresaId);
        console.log('[RPC][bootstrap_empresa_for_current_user][OK]', empresaId, (data as any)?.[0]?.status);
      } else {
        console.warn('[RPC] bootstrap retornou sem empresa_id.');
      }
    })();
  }, [nomeEmpresa, fantasiaEmpresa, supabase]);
}
