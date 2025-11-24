import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { ExtratoSummary } from '@/services/extrato';
import { formatCurrency } from '@/lib/utils';

interface Props {
  summary: ExtratoSummary | null;
}

const SummaryCard: React.FC<{ title: string; value: string; icon: React.ElementType; color: string; index: number; subtext?: string }> = ({ title, value, icon: Icon, color, index, subtext }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="h-full"
    >
      <GlassCard className={`p-6 flex items-start justify-between h-full shadow-lg rounded-2xl ${color}`}>
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-800 mt-2">{value}</p>
          {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
        </div>
        <div className="p-3 rounded-full bg-white/50">
          <Icon size={24} className="text-gray-700" />
        </div>
      </GlassCard>
    </motion.div>
  );
};

const ExtratoSummaryCards: React.FC<Props> = ({ summary }) => {
  if (!summary) return null;

  const summaryData = [
    {
      title: 'Saldo Inicial',
      value: formatCurrency(summary.saldo_inicial * 100),
      icon: Wallet,
      color: 'bg-gray-100/70',
    },
    {
      title: 'Créditos',
      value: formatCurrency(summary.creditos * 100),
      icon: TrendingUp,
      color: 'bg-green-100/70',
      subtext: `${formatCurrency(summary.creditos_nao_conciliados * 100)} não conciliado`
    },
    {
      title: 'Débitos',
      value: formatCurrency(summary.debitos * 100),
      icon: TrendingDown,
      color: 'bg-red-100/70',
      subtext: `${formatCurrency(summary.debitos_nao_conciliados * 100)} não conciliado`
    },
    {
      title: 'Saldo Final',
      value: formatCurrency(summary.saldo_final * 100),
      icon: Wallet,
      color: 'bg-blue-100/70',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      {summaryData.map((item, index) => (
        <SummaryCard key={item.title} {...item} index={index} />
      ))}
    </div>
  );
};

export default ExtratoSummaryCards;
