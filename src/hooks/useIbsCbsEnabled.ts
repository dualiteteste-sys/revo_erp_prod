import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { callRpc } from '@/lib/api';

/**
 * Hook that checks whether the IBS/CBS (Reforma Tributária 2026) feature flag
 * is enabled for the current empresa. Used to conditionally show IBS/CBS fields
 * in Naturezas de Operação, Regras Fiscais, and NF-e item forms.
 */
export function useIbsCbsEnabled(): boolean {
  const { activeEmpresaId } = useAuth();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!activeEmpresaId) {
      setEnabled(false);
      return;
    }
    let cancelled = false;
    callRpc<{ ok: boolean; fiscal_ibs_cbs_enabled: boolean }>('fiscal_ibs_cbs_status', {})
      .then((res) => {
        if (!cancelled) setEnabled(!!res?.fiscal_ibs_cbs_enabled);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => { cancelled = true; };
  }, [activeEmpresaId]);

  return enabled;
}
