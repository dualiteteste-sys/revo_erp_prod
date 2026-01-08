import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from './AuthProvider';
import { Database } from '../types/database.types';
import { logger } from '@/lib/logger';

type Subscription = Database['public']['Tables']['subscriptions']['Row'];
type Plan = Database['public']['Tables']['plans']['Row'];

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan | null;
}

interface SubscriptionContextType {
  subscription: SubscriptionWithPlan | null;
  loadingSubscription: boolean;
  refetchSubscription: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const supabase = useSupabase();
  const { activeEmpresa } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  const empresaId = useMemo(() => activeEmpresa?.id ?? null, [activeEmpresa?.id]);

  const fetchSubscription = useCallback(async (empresaId: string) => {
    setLoadingSubscription(true);
    try {
      // Importante: evitar `.single()`/`.maybeSingle()` aqui para não gerar 406 no PostgREST
      // quando a empresa ainda não tem assinatura (caso comum no primeiro login).
      const { data: subRows, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (subError) {
        throw subError;
      }

      const subData = (subRows?.[0] ?? null) as Subscription | null;

      if (subData?.stripe_price_id) {
        // Também evitar `.single()` para não gerar 406 caso o catálogo esteja incompleto/desatualizado.
        const { data: planRows, error: planError } = await supabase
          .from('plans')
          .select('*')
          .eq('stripe_price_id', subData.stripe_price_id)
          .limit(1);

        if (planError) {
          console.warn('Plano não encontrado para a assinatura:', planError);
        }

        const planData = (planRows?.[0] ?? null) as Plan | null;
        setSubscription({ ...subData, plan: planData });

      } else {
        setSubscription(subData ? { ...subData, plan: null } : null);
      }

    } catch (error) {
      logger.warn('Falha ao buscar assinatura', { error });
      setSubscription(null);
    } finally {
      setLoadingSubscription(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (empresaId) {
      fetchSubscription(empresaId);
    } else {
      setSubscription(null);
      setLoadingSubscription(false);
    }
  }, [empresaId, fetchSubscription]);

  useEffect(() => {
    if (!empresaId) return;

    const channel = supabase
      .channel(`revo:subscriptions:${empresaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `empresa_id=eq.${empresaId}` },
        () => {
          fetchSubscription(empresaId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [empresaId, fetchSubscription, supabase]);

  const refetchSubscription = () => {
    if (empresaId) {
      fetchSubscription(empresaId);
    }
  };

  const value = { subscription, loadingSubscription, refetchSubscription };

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription deve ser usado dentro de um SubscriptionProvider');
  }
  return context;
};
