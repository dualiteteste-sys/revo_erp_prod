import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Database } from '../../types/database.types';
import PricingCard from './PricingCard';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthProvider';
import { useToast } from '../../contexts/ToastProvider';

type Plan = Database['public']['Tables']['plans']['Row'];

const SubscriptionPlans: React.FC = () => {
  const supabase = useSupabase();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { session, activeEmpresa } = useAuth();
  const { addToast } = useToast();

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
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
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
    <div>
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
          Escolha o plano que melhor se adapta à sua empresa
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          Mude de plano a qualquer momento, sem complicações.
        </p>
      </div>

      <div className="mt-10 flex justify-center items-center">
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
        <span className="ml-3 bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
          Economize!
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto mt-12">
        {filteredPlans.map((plan, index) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            onStartTrial={() => handleCheckout(plan)}
            isLoading={checkoutLoading === plan.stripe_price_id}
            index={index}
          />
        ))}
      </div>
    </div>
  );
};

export default SubscriptionPlans;
