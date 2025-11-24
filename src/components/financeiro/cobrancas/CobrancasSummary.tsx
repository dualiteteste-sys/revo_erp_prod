import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { CobrancaSummary } from '@/services/cobrancas';
import { formatCurrency } from '@/lib/utils';

interface Props {
  summary: CobrancaSummary;
}

const SummaryCard: React.FC<{ title: string; value: string; icon: React.ElementType; color: string; index: number }> = ({ title, value, icon: Icon, color, index }) => {
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
        </div>
        <div className="p-3 rounded-full bg-white/50">
          <Icon size={24} className="text-gray-700" />
        </div>
      </GlassCard>
    </motion.div>
  );
};

const CobrancasSummary: React.FC<Props> = ({ summary }) => {
  const summaryData = [
    {
      title: 'Em Aberto',
      value: formatCurrency(summary.em_aberto * 100), // Assuming summary returns value, if count remove formatCurrency
      icon: Clock,
      color: 'bg-blue-100/70',
    },
    {
      title: 'Pendentes Envio',
      value: formatCurrency(summary.pendentes * 100),
      icon: AlertCircle,
      color: 'bg-yellow-100/70',
    },
    {
      title: 'Liquidadas',
      value: formatCurrency(summary.liquidadas * 100),
      icon: CheckCircle,
      color: 'bg-green-100/70',
    },
    {
      title: 'Com Erro',
      value: formatCurrency(summary.com_erro * 100),
      icon: XCircle,
      color: 'bg-red-100/70',
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

export default CobrancasSummary;
