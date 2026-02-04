import React from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { Database } from '../../types/database.types';

type Plan = Database['public']['Tables']['plans']['Row'];

interface PricingCardProps {
  plan: Plan;
  onStartTrial: () => void;
  isLoading: boolean;
  index: number;
  density?: 'regular' | 'compact';
  monthlyAmountCentsForYearly?: number;
}

const planDetails: Record<string, { description: string; features: string[]; isPopular?: boolean }> = {
  START: {
    description: 'Para empreendedores e micro empresas.',
    features: ['Usuários ilimitados', 'Até 20 NFS-e/mês', 'Suporte via ticket'],
  },
  PRO: {
    description: 'Para PMEs em crescimento.',
    features: ['Tudo do Essencial/Start', 'Relatórios e fluxos mais completos', 'Suporte via chat', 'PDV'],
  },
  MAX: {
    description: 'Para operações com mais controle e governança.',
    features: ['Tudo do Pro', 'Financeiro forte + mais automações', 'Relatórios avançados'],
    isPopular: true,
  },
  INDUSTRIA: {
    description: 'Para chão de fábrica e PCP (quando ativado).',
    features: ['OP/OB + roteiros + Ficha Técnica', 'Execução + tela do operador', 'Qualidade mínimo'],
  },
  SCALE: {
    description: 'Para multiunidade, integrações e governança.',
    features: ['Tudo do Indústria', 'Integrações e webhooks', 'Auditoria e observabilidade'],
  },
  ULTRA: {
    description: 'Plano legado (não recomendado).',
    features: ['Entre em contato com o suporte'],
  },
};

const PricingCard: React.FC<PricingCardProps> = ({
  plan,
  onStartTrial,
  isLoading,
  index,
  density = 'regular',
  monthlyAmountCentsForYearly,
}) => {
  const details = planDetails[plan.slug] ?? {
    description: 'Plano sob medida para sua operação.',
    features: ['Recursos conforme contratação'],
  };
  const isPopular = details.isPopular || false;
  const isYearly = plan.billing_cycle === 'yearly';
  const monthlyBase = typeof monthlyAmountCentsForYearly === 'number' ? monthlyAmountCentsForYearly : null;
  const yearlyTotalCents = monthlyBase ? monthlyBase * 10 : plan.amount_cents;
  // UX: no anual, mostrar "R$ 125/mês" (arredondado) e explicar o total anual (pague 10 meses).
  const yearlyPerMonthCents = monthlyBase
    ? Math.round(((monthlyBase * 10) / 12) / 100) * 100
    : Math.round((plan.amount_cents / 12) / 100) * 100;
  const displayCents = isYearly ? yearlyPerMonthCents : plan.amount_cents;
  const isCompact = density === 'compact';

	  const cardVariants = {
	    initial: { opacity: 0, y: 50 },
	    animate: {
	      opacity: 1,
	      y: 0,
	      transition: {
	        duration: 0.5,
	        delay: index * 0.15,
	        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
	      },
	    },
	  };

  return (
    <motion.div
      variants={cardVariants}
      initial="initial"
      animate="animate"
      className={`relative flex flex-col rounded-3xl shadow-lg ${
        isPopular
          ? 'bg-gray-800 text-white border-2 border-blue-500'
          : 'bg-white'
      } ${isCompact ? 'p-5' : 'p-8'}`}
    >
      {isPopular && (
        <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
          <div className="bg-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full uppercase">
            Popular
          </div>
        </div>
      )}
      
      <h3 className={`${isCompact ? 'text-lg' : 'text-xl'} font-semibold`}>{plan.name}</h3>
      <p className={`mt-2 text-sm ${isCompact ? 'min-h-[32px]' : 'min-h-[40px]'} ${isPopular ? 'text-gray-300' : 'text-gray-500'}`}>
        {details.description}
      </p>
      
      <div className="mt-4 flex items-baseline gap-1">
        <span className={`text-xl font-semibold ${isPopular ? 'text-gray-300' : 'text-gray-500'}`}>R$</span>
        <span className={`font-extrabold ${isCompact ? 'text-3xl' : 'text-4xl'} leading-none tracking-tight ${isPopular ? 'text-white' : 'text-gray-900'}`}>
          {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(displayCents / 100)}
        </span>
        <span className={`ml-1 text-base font-medium ${isPopular ? 'text-gray-400' : 'text-gray-500'}`}>
          /mês
        </span>
      </div>
      {isYearly && (
        <div className={`mt-2 text-xs ${isPopular ? 'text-gray-300' : 'text-gray-500'}`}>
          <div>Cobrado anualmente • economize 2 meses</div>
          <div className="mt-1">
            Total anual:{' '}
            <span className={isPopular ? 'text-gray-200' : 'text-gray-700'}>
              R$ {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(yearlyTotalCents / 100)}
            </span>
          </div>
        </div>
      )}

      <ul className={`${isCompact ? 'mt-6' : 'mt-8'} space-y-3 flex-grow`}>
        {(isCompact ? details.features.slice(0, 3) : details.features).map((feature, i) => (
          <li key={i} className="flex items-start">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-3 ${isPopular ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
              <Check size={16} className="text-blue-500" />
            </div>
            <span className={isPopular ? 'text-gray-300' : 'text-gray-600'}>{feature}</span>
          </li>
        ))}
      </ul>

      <div className={`${isCompact ? 'mt-6' : 'mt-8'}`}>
        <button
          onClick={onStartTrial}
          disabled={isLoading}
          className={`w-full py-3 px-4 text-base font-semibold rounded-lg transition-transform duration-200 flex items-center justify-center ${
            isPopular
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          } disabled:opacity-70 disabled:cursor-not-allowed`}
        >
          {isLoading ? <Loader2 className="animate-spin" /> : 'Teste 60 dias grátis'}
        </button>
      </div>
    </motion.div>
  );
};

export default PricingCard;
