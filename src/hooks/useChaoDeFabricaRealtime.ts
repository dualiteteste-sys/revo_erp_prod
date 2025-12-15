import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthProvider';

/**
 * Observa as tabelas de operações/apontamentos e notifica a cada mudança relevante.
 * Usa um debounce simples para evitar múltiplos refreshs em sequência.
 */
export function useChaoDeFabricaRealtime(onPulse: () => void) {
  const { activeEmpresaId } = useAuth();
  const [connected, setConnected] = useState(false);
  const pulseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPulseRef = useRef(onPulse);

  useEffect(() => {
    onPulseRef.current = onPulse;
  }, [onPulse]);

  const schedulePulse = useCallback(() => {
    if (pulseTimeout.current) return;
    pulseTimeout.current = setTimeout(() => {
      onPulseRef.current();
      pulseTimeout.current = null;
    }, 600);
  }, []);

  useEffect(() => {
    if (!activeEmpresaId) {
      setConnected(false);
      return;
    }

    const channelName = `industria-operacoes-${activeEmpresaId}`;
    const channel = supabase.channel(channelName);

    const handler = () => schedulePulse();

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'industria_operacoes',
          filter: `empresa_id=eq.${activeEmpresaId}`,
        },
        handler
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'industria_operacoes_apontamentos',
          filter: `empresa_id=eq.${activeEmpresaId}`,
        },
        handler
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          setConnected(false);
        }
      });

    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
      if (pulseTimeout.current) {
        clearTimeout(pulseTimeout.current);
        pulseTimeout.current = null;
      }
    };
  }, [activeEmpresaId, schedulePulse]);

  return connected;
}
