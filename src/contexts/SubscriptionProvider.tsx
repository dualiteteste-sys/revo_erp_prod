import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode, useCallback } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from './AuthProvider';
import { Database } from '../types/database.types';
import { logger } from '@/lib/logger';
import { getLocalPlanSlug, isLocalBillingBypassEnabled } from '@/lib/localDev';

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

  const firstRow = useCallback(<T,>(data: unknown): T | null => {
    if (!data) return null;
    if (Array.isArray(data)) return ((data[0] ?? null) as T | null);
    if (typeof data === 'object') return (data as T);
    return null;
  }, []);

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

      const subData = firstRow<Subscription>(subRows);

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

        const planData = firstRow<Plan>(planRows);
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
  }, [firstRow, supabase]);

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
