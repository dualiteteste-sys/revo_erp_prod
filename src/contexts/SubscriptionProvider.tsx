import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode, useCallback } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from './AuthProvider';
import { Database } from '../types/database.types';
import { logger } from '@/lib/logger';
import { getLocalPlanSlug, isLocalBillingBypassEnabled } from '@/lib/localDev';
import { callRpc } from '@/lib/api';

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
  const { activeEmpresa, session } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const autoSyncAttemptedRef = useRef<string | null>(null);

  const empresaId = useMemo(() => activeEmpresa?.id ?? null, [activeEmpresa?.id]);
  const accessToken = useMemo(() => session?.access_token ?? null, [session?.access_token]);
  const localBypass = useMemo(() => isLocalBillingBypassEnabled(), []);
  const hasPendingPlanIntent = useCallback(() => {
    try {
      return Boolean((localStorage.getItem('pending_plan_slug') ?? '').trim());
    } catch {
      return false;
    }
  }, []);

  const fetchSubscription = useCallback(async (empresaId: string) => {
    setLoadingSubscription(true);
    try {
      // RPC-first: evita 403/406 por PostgREST e não depende de "empresa ativa" para ler a assinatura.
      const data = await callRpc<{ subscription: Subscription | null; plan: Plan | null } | null>(
        'billing_subscription_with_plan_get',
        { p_empresa_id: empresaId },
      );

      if (!data?.subscription) {
        setSubscription(null);
        return;
      }

      setSubscription({ ...data.subscription, plan: data.plan ?? null });
    } catch (error) {
      logger.warn('Falha ao buscar assinatura', { error });
      setSubscription(null);
    } finally {
      setLoadingSubscription(false);
    }
  }, []);

  // Estado da arte: se a empresa acabou de assinar e o webhook ainda não sincronizou,
  // tentamos um "self-heal" (best-effort) sem exigir clique manual em "Sincronizar com Stripe".
  useEffect(() => {
    if (localBypass) return;
    if (!empresaId) return;
    if (!accessToken) return;
    if (loadingSubscription) return;
    // Se o usuário está no fluxo de iniciar checkout (teste grátis),
    // não faz sentido tentar sincronizar assinatura antes do checkout.
    if (hasPendingPlanIntent()) return;

    // Só tenta quando não há assinatura local ainda.
    if (subscription) return;

    // Evita loops: 1 tentativa por empresa por sessão (runtime).
    if (autoSyncAttemptedRef.current === empresaId) return;
    autoSyncAttemptedRef.current = empresaId;

    void (async () => {
      try {
        const { error } = await supabase.functions.invoke('billing-sync-subscription', {
          body: { empresa_id: empresaId },
        });
        if (error) {
          logger.warn('[Billing][AutoSync] Falha ao sincronizar assinatura (best-effort)', { error });
          return;
        }
        await fetchSubscription(empresaId);
      } catch (e) {
        logger.warn('[Billing][AutoSync] Erro inesperado (best-effort)', { error: e });
      }
    })();
  }, [empresaId, fetchSubscription, loadingSubscription, localBypass, subscription, supabase.functions, accessToken, hasPendingPlanIntent]);

  useEffect(() => {
    if (localBypass) {
      const now = new Date();
      const end = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
      const slug = getLocalPlanSlug();
      const fakePlan: Plan = {
        id: 'local-plan',
        slug: slug as any,
        name: `LOCAL ${slug}`,
        billing_cycle: 'yearly',
        currency: 'BRL',
        amount_cents: 0,
        stripe_price_id: 'local_price',
        active: true,
        created_at: now.toISOString(),
      };

      const fakeSub: Subscription = {
        id: 'local-subscription',
        empresa_id: empresaId ?? 'local-empresa',
        status: 'active',
        current_period_end: end,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        stripe_subscription_id: null,
        stripe_price_id: fakePlan.stripe_price_id,
        plan_slug: slug,
        billing_cycle: 'yearly',
        cancel_at_period_end: false,
      };

      setSubscription({ ...fakeSub, plan: fakePlan });
      setLoadingSubscription(false);
      return;
    }

    if (empresaId && accessToken) {
      fetchSubscription(empresaId);
    } else {
      setSubscription(null);
      setLoadingSubscription(false);
    }
  }, [empresaId, fetchSubscription, localBypass, accessToken]);

  useEffect(() => {
    if (localBypass) return;
    if (!empresaId) return;
    if (!accessToken) return;

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
  }, [empresaId, fetchSubscription, supabase, localBypass, accessToken]);

  const refetchSubscription = () => {
    if (localBypass) return;
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
