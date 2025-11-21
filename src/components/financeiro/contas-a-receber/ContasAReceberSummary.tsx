import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { ContasAReceberSummary as SummaryData } from '@/services/contasAReceber';

interface ContasAReceberSummaryProps {
  summary: SummaryData;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
};

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
                    <p className="text-3xl font-bold text-gray-800 mt-2">{value}</p>
                </div>
                <div className="p-3 rounded-full bg-white/50">
                    <Icon size={24} className="text-gray-700" />
                </div>
            </GlassCard>
        </motion.div>
    );
};

const ContasAReceberSummary: React.FC<ContasAReceberSummaryProps> = ({ summary }) => {
    const summaryData = [
        {
            title: 'Pendente',
            value: formatCurrency(summary.total_pendente),
            icon: DollarSign,
            color: 'bg-yellow-100/70',
        },
        {
            title: 'Recebido (este mês)',
            value: formatCurrency(summary.total_pago_mes),
            icon: CheckCircle,
            color: 'bg-green-100/70',
        },
        {
            title: 'Vencido',
            value: formatCurrency(summary.total_vencido),
            icon: AlertCircle,
            color: 'bg-red-100/70',
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {summaryData.map((item, index) => (
                <SummaryCard key={item.title} {...item} index={index} />
            ))}
        </div>
    );
};

export default ContasAReceberSummary;
