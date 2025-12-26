import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { logger } from '@/lib/logger';

export type PlanoMvp = 'servicos' | 'industria' | 'ambos';

export interface EmpresaFeatures {
  revo_send_enabled: boolean;
  nfe_emissao_enabled: boolean;
  plano_mvp: PlanoMvp;
  max_users: number;
  servicos_enabled: boolean;
  industria_enabled: boolean;
  loading: boolean;
  error: unknown | null;
  refetch: () => Promise<void>;
}

const DEFAULT_FEATURES: Omit<EmpresaFeatures, 'loading' | 'refetch'> = {
  revo_send_enabled: false,
  nfe_emissao_enabled: false,
  plano_mvp: 'ambos',
  max_users: 999,
  servicos_enabled: false,
  industria_enabled: false,
  error: null,
};

export function useEmpresaFeatures(): EmpresaFeatures {
  const supabase = useSupabase();
  const { activeEmpresa } = useAuth();
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState(DEFAULT_FEATURES);

  const fetch = useCallback(async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) {
      setFeatures(DEFAULT_FEATURES);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('empresa_features')
        .select(
          'revo_send_enabled, nfe_emissao_enabled, plano_mvp, max_users, servicos_enabled, industria_enabled'
        )
        .eq('empresa_id', empresaId)
        .single();

      if (error) throw error;

      setFeatures({
        revo_send_enabled: !!data?.revo_send_enabled,
        nfe_emissao_enabled: !!data?.nfe_emissao_enabled,
        plano_mvp: (data?.plano_mvp ?? 'ambos') as PlanoMvp,
        max_users: typeof data?.max_users === 'number' ? data.max_users : 999,
        servicos_enabled: data?.servicos_enabled ?? true,
        industria_enabled: data?.industria_enabled ?? true,
        error: null,
      });
    } catch (error) {
      logger.warn('[EmpresaFeatures] Falha ao buscar empresa_features; bloqueando acesso até validar plano/limites', {
        error,
      });
      setFeatures((prev) => ({
        ...prev,
        servicos_enabled: false,
        industria_enabled: false,
        error,
      }));
    } finally {
      setLoading(false);
    }
  }, [activeEmpresa?.id, supabase]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  useEffect(() => {
    const onRefresh = () => {
      void fetch();
    };
    window.addEventListener('empresa-features-refresh', onRefresh);
    return () => window.removeEventListener('empresa-features-refresh', onRefresh);
  }, [fetch]);

  return {
    ...features,
    loading,
    error: features.error,
    refetch: fetch,
  };
}
