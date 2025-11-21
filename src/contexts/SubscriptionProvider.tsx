import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from './AuthProvider';
import { Database } from '../types/database.types';

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

  const fetchSubscription = useCallback(async (empresaId: string) => {
    setLoadingSubscription(true);
    try {
      const { data: subData, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('empresa_id', empresaId)
        .single();

      if (subError && subError.code !== 'PGRST116') {
        throw subError;
      }

      if (subData && subData.stripe_price_id) {
        const { data: planData, error: planError } = await supabase
          .from('plans')
          .select('*')
          .eq('stripe_price_id', subData.stripe_price_id)
          .single();

        if (planError) {
          console.warn('Plano não encontrado para a assinatura:', planError);
        }
        
        setSubscription({ ...subData, plan: planData || null });

      } else {
        setSubscription(subData ? { ...subData, plan: null } : null);
      }

    } catch (error) {
      console.error('Erro ao buscar assinatura:', error);
      setSubscription(null);
    } finally {
      setLoadingSubscription(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (activeEmpresa?.id) {
      fetchSubscription(activeEmpresa.id);
    } else {
      setSubscription(null);
      setLoadingSubscription(false);
    }
  }, [activeEmpresa, fetchSubscription]);

  const refetchSubscription = () => {
    if (activeEmpresa?.id) {
      fetchSubscription(activeEmpresa.id);
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
