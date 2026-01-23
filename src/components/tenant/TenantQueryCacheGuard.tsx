import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/contexts/AppContextProvider';

/**
 * Guardrail de multi-tenant no frontend:
 * - Ao trocar de empresa ativa, limpa cache do React Query para evitar qualquer
 *   risco de UI reaproveitar dados da empresa anterior.
 *
 * Observação: é um "airbag" — a blindagem real continua sendo RLS/RPC no backend.
 */
export default function TenantQueryCacheGuard() {
  const { session, activeEmpresaId } = useAppContext();
  const queryClient = useQueryClient();
  const prevEmpresaIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session) {
      prevEmpresaIdRef.current = null;
      return;
    }

    if (!activeEmpresaId) return;

    const prev = prevEmpresaIdRef.current;
    prevEmpresaIdRef.current = activeEmpresaId;
    if (!prev || prev === activeEmpresaId) return;

    queryClient.cancelQueries();
    queryClient.clear();
  }, [activeEmpresaId, queryClient, session]);

  return null;
}

