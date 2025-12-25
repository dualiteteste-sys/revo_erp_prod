import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '../contexts/AuthProvider';
import { logger } from '@/lib/logger';

export interface FeatureFlags {
  revo_send_enabled: boolean;
  nfe_emissao_enabled: boolean;
  loading: boolean;
}

export const useFeatureFlags = (): FeatureFlags => {
  const supabase = useSupabase();
  const { activeEmpresa } = useAuth();
  const [flags, setFlags] = useState<Omit<FeatureFlags, 'loading'>>({
    revo_send_enabled: false,
    nfe_emissao_enabled: false,
  });
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async (empresaId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('empresa_features')
        .select('revo_send_enabled, nfe_emissao_enabled')
        .eq('empresa_id', empresaId)
        .single();

      if (error) throw error;
      
      setFlags({
        revo_send_enabled: data?.revo_send_enabled || false,
        nfe_emissao_enabled: data?.nfe_emissao_enabled || false,
      });

    } catch (error) {
      logger.warn('[FeatureFlags] Falha ao buscar flags', error);
      setFlags({ revo_send_enabled: false, nfe_emissao_enabled: false });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (activeEmpresa?.id) {
      fetchFlags(activeEmpresa.id);
    } else {
      setFlags({ revo_send_enabled: false, nfe_emissao_enabled: false });
      setLoading(false);
    }
  }, [activeEmpresa, fetchFlags]);

  return { ...flags, loading };
};
