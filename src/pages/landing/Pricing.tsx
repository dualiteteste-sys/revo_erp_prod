import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Database } from '@/types/database.types';
import PricingCard from '@/components/billing/PricingCard';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { motion } from 'framer-motion';
import { OnboardingIntent } from '@/types/onboarding';

type Plan = Database['public']['Tables']['plans']['Row'];

interface PricingProps {
    onSignUpClick: (intent: OnboardingIntent) => void;
}

const Pricing: React.FC<PricingProps> = ({ onSignUpClick }) => {
  const supabase = useSupabase();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const { addToast } = useToast();

  const monthlyBySlug = React.useMemo(() => {
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

  const handleStartTrial = (plan: Plan) => {
    const intent: OnboardingIntent = {
      planSlug: plan.slug,
      billingCycle: plan.billing_cycle,
      type: 'trial'
    };
    onSignUpClick(intent);
  };

  const filteredPlans = plans.filter(p => p.billing_cycle === billingCycle);

  return (
    <section id="pricing" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Escolha o plano que mais se adapta à sua empresa
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Comece grátis por 30 dias. Cancele quando quiser.
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
          {billingCycle === 'yearly' && (
            <span className="ml-3 bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              Economize 2 meses
            </span>
          )}
        </div>

        <div className="mt-12">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="animate-spin text-blue-600" size={48} />
            </div>
          ) : (
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
              initial="initial"
              whileInView="animate"
              viewport={{ once: true, amount: 0.2 }}
              variants={{
                animate: {
                  transition: {
                    staggerChildren: 0.1,
                  },
                },
              }}
            >
              {filteredPlans.map((plan, index) => (
                <PricingCard
                  key={plan.id}
                  plan={plan}
                  onStartTrial={() => handleStartTrial(plan)}
                  isLoading={false}
                  index={index}
                  monthlyAmountCentsForYearly={plan.billing_cycle === 'yearly' ? (monthlyBySlug.get(plan.slug) ?? undefined) : undefined}
                />
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
