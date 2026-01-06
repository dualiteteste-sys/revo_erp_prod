import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Database } from '../../types/database.types';
import PricingCard from './PricingCard';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthProvider';
import { useToast } from '../../contexts/ToastProvider';

type Plan = Database['public']['Tables']['plans']['Row'];

function useElementWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const next = entries?.[0]?.contentRect?.width ?? 0;
      setWidth(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

const SubscriptionPlans: React.FC = () => {
  const supabase = useSupabase();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { session, activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>();
  const isCompact = containerWidth > 0 && containerWidth < 980;

  const monthlyBySlug = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of plans) {
      if (p.billing_cycle === 'monthly') map.set(p.slug, p.amount_cents);
    }
    return map;
  }, [plans]);

  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('active', true)
        .order('amount_cents', { ascending: true });

      if (error) {
        console.error('Erro ao buscar planos:', error);
        addToast('Não foi possível carregar os planos.', 'error');
      } else {
        setPlans(data);
      }
      setLoading(false);
    };
    fetchPlans();
  }, [addToast, supabase]);

  const handleCheckout = async (plan: Plan) => {
    if (!session || !activeEmpresa) {
      addToast("Você precisa estar logado e com uma empresa ativa para assinar um plano.", "error");
      return;
    }

    setCheckoutLoading(plan.stripe_price_id);

    try {
      const { data, error } = await supabase.functions.invoke('billing-checkout', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          empresa_id: activeEmpresa.id,
          plan_slug: plan.slug.toUpperCase(),
          billing_cycle: plan.billing_cycle,
        },
      });

      if (error) throw error;
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("URL de checkout não recebida.");
      }
    } catch (error: any) {
      console.error("Erro ao criar sessão de checkout:", error);
      addToast(error.message || "Erro ao iniciar o checkout.", "error");
      setCheckoutLoading(null);
    }
  };

  const filteredPlans = plans.filter(p => p.billing_cycle === billingCycle);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div className={`text-center ${isCompact ? 'mb-6' : 'mb-12'}`}>
        <h1 className={`${isCompact ? 'text-2xl' : 'text-3xl md:text-4xl'} font-bold text-gray-800`}>
          Escolha o plano que melhor se adapta à sua empresa
        </h1>
        <p className={`${isCompact ? 'mt-2 text-sm' : 'mt-4 text-lg'} text-gray-600 max-w-2xl mx-auto`}>
          Mude de plano a qualquer momento, sem complicações.
        </p>
      </div>

      <div className={`${isCompact ? 'mt-6' : 'mt-10'} flex justify-center items-center`}>
        <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-blue-600' : 'text-gray-500'}`}>
          Mensal
        </span>
        <button
          onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
          className={`mx-4 relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none ${billingCycle === 'yearly' ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${billingCycle === 'yearly' ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
        <span className={`text-sm font-medium ${billingCycle === 'yearly' ? 'text-blue-600' : 'text-gray-500'}`}>
          Anual
        </span>
        {billingCycle === 'yearly' && (
          <span className="ml-3 bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
            Economize 2 meses
          </span>
        )}
      </div>

      <div
        className={[
          'mx-auto mt-8 grid gap-6',
          isCompact ? 'max-w-3xl grid-cols-1 sm:grid-cols-2' : 'max-w-7xl grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-12',
        ].join(' ')}
      >
        {filteredPlans.map((plan, index) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            onStartTrial={() => handleCheckout(plan)}
            isLoading={checkoutLoading === plan.stripe_price_id}
            index={index}
            density={isCompact ? 'compact' : 'regular'}
            monthlyAmountCentsForYearly={plan.billing_cycle === 'yearly' ? (monthlyBySlug.get(plan.slug) ?? undefined) : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export default SubscriptionPlans;
