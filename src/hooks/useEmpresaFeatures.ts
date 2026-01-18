import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { logger } from '@/lib/logger';
import { getLocalPlanSlug, isLocalBillingBypassEnabled } from '@/lib/localDev';
import { empresaFeaturesGet, type PlanoMvp } from '@/services/empresaFeatures';

export interface EmpresaFeatures {
  revo_send_enabled: boolean;
  nfe_emissao_enabled: boolean;
  plano_mvp: PlanoMvp;
  max_users: number;
  max_nfe_monthly: number;
  servicos_enabled: boolean;
  industria_enabled: boolean;
  isFallback: boolean;
  loading: boolean;
  error: unknown | null;
  refetch: () => Promise<void>;
}

const DEFAULT_FEATURES: Omit<EmpresaFeatures, 'loading' | 'refetch'> = {
  revo_send_enabled: false,
  nfe_emissao_enabled: false,
  plano_mvp: 'ambos',
  max_users: 999,
  max_nfe_monthly: 999,
  servicos_enabled: false,
  industria_enabled: false,
  isFallback: false,
  error: null,
};

export function useEmpresaFeatures(): EmpresaFeatures {
  const { activeEmpresa } = useAuth();
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState(DEFAULT_FEATURES);

  const localBypass = isLocalBillingBypassEnabled();

  const fetch = useCallback(async () => {
    if (localBypass) {
      const slug = getLocalPlanSlug();
      const industriaEnabled = slug === 'INDUSTRIA' || slug === 'SCALE';
      const servicosEnabled = slug !== 'INDUSTRIA';
      setFeatures({
        revo_send_enabled: true,
        nfe_emissao_enabled: true,
        plano_mvp: 'ambos',
        max_users: 999,
        max_nfe_monthly: 999,
        servicos_enabled: servicosEnabled,
        industria_enabled: industriaEnabled,
        isFallback: true,
        error: null,
      });
      setLoading(false);
      return;
    }

    const empresaId = activeEmpresa?.id;
    if (!empresaId) {
      setFeatures(DEFAULT_FEATURES);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await empresaFeaturesGet();
      if (!data) throw new Error('Falha ao carregar empresa_features.');

      setFeatures({
        revo_send_enabled: !!data?.revo_send_enabled,
        nfe_emissao_enabled: !!data?.nfe_emissao_enabled,
        plano_mvp: (data?.plano_mvp ?? 'ambos') as PlanoMvp,
        max_users: typeof data?.max_users === 'number' ? data.max_users : 999,
        max_nfe_monthly: typeof data?.max_nfe_monthly === 'number' ? data.max_nfe_monthly : 999,
        servicos_enabled: !!data?.servicos_enabled,
        industria_enabled: !!data?.industria_enabled,
        isFallback: false,
        error: null,
      });
    } catch (error) {
      logger.warn('[EmpresaFeatures] Falha ao buscar empresa_features; usando fallback seguro', {
        error,
      });
      setFeatures((prev) => ({
        ...prev,
        // Fallback seguro:
        // - UI não fica "travada" por erro/transiente de permissão.
        // - O enforcement real deve acontecer no DB via RPCs/Policies.
        servicos_enabled: true,
        industria_enabled: true,
        isFallback: true,
        error,
      }));
    } finally {
      setLoading(false);
    }
  }, [activeEmpresa?.id, localBypass]);

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
