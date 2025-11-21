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
}

const planDetails: { [key: string]: { description: string, features: string[], isPopular?: boolean } } = {
  START: {
    description: 'Para empreendedores e micro empresas.',
    features: ['Usuários ilimitados', 'Até 20 NFS-e/mês', 'Suporte via ticket'],
  },
  PRO: {
    description: 'Para PMEs em crescimento.',
    features: ['Tudo do Start', 'Até 200 NFS-e/mês', 'Suporte via chat', 'Módulo de PDV'],
    isPopular: true,
  },
  MAX: {
    description: 'Para operações avançadas.',
    features: ['Tudo do Pro', 'Controle de produção (BOM/OP)', 'Suporte por telefone'],
  },
  ULTRA: {
    description: 'Para indústrias e alto volume.',
    features: ['Tudo do Max', 'Implementação personalizada', 'Gerente de contas'],
  },
};

const PricingCard: React.FC<PricingCardProps> = ({
  plan,
  onStartTrial,
  isLoading,
  index,
}) => {
  const details = planDetails[plan.slug];
  const isPopular = details?.isPopular || false;

  const cardVariants = {
    initial: { opacity: 0, y: 50 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        delay: index * 0.15,
        ease: 'easeOut',
      },
    },
  };

  return (
    <motion.div
      variants={cardVariants}
      initial="initial"
      animate="animate"
      className={`relative flex flex-col rounded-3xl p-8 shadow-lg ${
        isPopular ? 'bg-gray-800 text-white border-2 border-blue-500' : 'bg-white'
      }`}
    >
      {isPopular && (
        <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
          <div className="bg-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full uppercase">
            Popular
          </div>
        </div>
      )}
      
      <h3 className="text-xl font-semibold">{plan.name}</h3>
      <p className={`mt-2 text-sm min-h-[40px] ${isPopular ? 'text-gray-300' : 'text-gray-500'}`}>
        {details.description}
      </p>
      
      <div className="mt-4 flex items-baseline gap-1">
        <span className={`text-xl font-semibold ${isPopular ? 'text-gray-300' : 'text-gray-500'}`}>R$</span>
        <span className={`font-extrabold text-4xl leading-none tracking-tight ${isPopular ? 'text-white' : 'text-gray-900'}`}>
          {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(plan.amount_cents / 100)}
        </span>
        <span className={`ml-1 text-base font-medium ${isPopular ? 'text-gray-400' : 'text-gray-500'}`}>
          /mês
        </span>
      </div>

      <ul className="mt-8 space-y-3 flex-grow">
        {details.features.map((feature, i) => (
          <li key={i} className="flex items-start">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-3 ${isPopular ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
              <Check size={16} className="text-blue-500" />
            </div>
            <span className={isPopular ? 'text-gray-300' : 'text-gray-600'}>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <button
          onClick={onStartTrial}
          disabled={isLoading}
          className={`w-full py-3 px-4 text-base font-semibold rounded-lg transition-transform duration-200 flex items-center justify-center ${
            isPopular
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          } disabled:opacity-70 disabled:cursor-not-allowed`}
        >
          {isLoading ? <Loader2 className="animate-spin" /> : 'Teste 30 dias grátis'}
        </button>
      </div>
    </motion.div>
  );
};

export default PricingCard;
