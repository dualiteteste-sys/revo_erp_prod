import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthProvider';
import { logger } from '@/lib/logger';
import { isLocalBillingBypassEnabled } from '@/lib/localDev';
import { empresaFeaturesGet } from '@/services/empresaFeatures';

export interface FeatureFlags {
  revo_send_enabled: boolean;
  nfe_emissao_enabled: boolean;
  loading: boolean;
  refetch: () => Promise<void>;
}

export const useFeatureFlags = (): FeatureFlags => {
  const { activeEmpresa } = useAuth();
  const localBypass = isLocalBillingBypassEnabled();
  const [flags, setFlags] = useState<Omit<FeatureFlags, 'loading'>>({
    revo_send_enabled: false,
    nfe_emissao_enabled: false,
    refetch: async () => {},
  });
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async (empresaId: string) => {
    setLoading(true);
    try {
      if (localBypass) {
        setFlags({
          revo_send_enabled: true,
          nfe_emissao_enabled: true,
          refetch: async () => fetchFlags(empresaId),
        });
        return;
      }

      const data = await empresaFeaturesGet();
      if (!data) throw new Error('Falha ao carregar empresa_features.');
      
      setFlags({
        revo_send_enabled: data?.revo_send_enabled ?? false,
        nfe_emissao_enabled: data?.nfe_emissao_enabled ?? false,
        refetch: async () => fetchFlags(empresaId),
      });

    } catch (error) {
      logger.warn('[FeatureFlags] Falha ao buscar flags', { error });
      setFlags({ revo_send_enabled: false, nfe_emissao_enabled: false, refetch: async () => fetchFlags(empresaId) });
    } finally {
      setLoading(false);
    }
  }, [localBypass]);

  useEffect(() => {
    if (activeEmpresa?.id) {
      fetchFlags(activeEmpresa.id);
    } else {
      setFlags({ revo_send_enabled: false, nfe_emissao_enabled: false, refetch: async () => {} });
      setLoading(false);
    }
  }, [activeEmpresa, fetchFlags]);

  useEffect(() => {
    const onRefresh = () => {
      if (activeEmpresa?.id) {
        void fetchFlags(activeEmpresa.id);
      }
    };
    window.addEventListener('empresa-features-refresh', onRefresh);
    return () => window.removeEventListener('empresa-features-refresh', onRefresh);
  }, [activeEmpresa?.id, fetchFlags]);

  return { ...flags, loading };
};
