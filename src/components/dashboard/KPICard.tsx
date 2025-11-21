import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

interface KPICardProps {
  title: string;
  value: string;
  trend: string;
  isPositive: boolean;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  index: number;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, trend, isPositive, icon: Icon, iconBg, iconColor, index }) => {
  const trendColor = isPositive ? "text-green-600" : "text-red-600";
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="h-full"
    >
      <GlassCard className="p-6 flex items-start justify-between h-full bg-white/70 shadow-2xl shadow-blue-500/10 rounded-2xl">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-800 mt-2">{value}</p>
          <div className={`flex items-center gap-1 text-sm mt-2 ${trendColor}`}>
            <TrendIcon size={16} />
            <span>{trend}</span>
          </div>
        </div>
        <div className={`p-3 rounded-full bg-gradient-to-br ${iconBg}`}>
          <Icon size={24} className={iconColor} />
        </div>
      </GlassCard>
    </motion.div>
  );
};

export default KPICard;
