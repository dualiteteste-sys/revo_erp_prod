import React from 'react';
import { motion } from 'framer-motion';
import { Laptop, Sofa, Shirt, Utensils, MoreHorizontal } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

const rankingData = [
  { name: 'Eletrônicos', value: 'R$ 45.120', progress: 85, icon: Laptop, gradient: 'from-blue-400 to-blue-600' },
  { name: 'Móveis', value: 'R$ 32.800', progress: 70, icon: Sofa, gradient: 'from-green-400 to-green-600' },
  { name: 'Roupas', value: 'R$ 21.500', progress: 55, icon: Shirt, gradient: 'from-orange-400 to-orange-600' },
  { name: 'Alimentos', value: 'R$ 18.900', progress: 40, icon: Utensils, gradient: 'from-red-400 to-red-600' },
  { name: 'Outros', value: 'R$ 9.200', progress: 25, icon: MoreHorizontal, gradient: 'from-purple-400 to-purple-600' },
];

const RankingCategorias: React.FC = () => {
  return (
    <GlassCard className="p-6 flex flex-col h-96">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Ranking por Categoria</h3>
      <div className="flex-1 overflow-y-auto -mr-3 pr-3 scrollbar-styled">
        <div className="space-y-4">
          {rankingData.map((item, index) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.15 }}
            >
              <div className="flex items-center gap-4 mb-2">
                <div className={`p-2 rounded-lg bg-gradient-to-r ${item.gradient}`}>
                  <item.icon size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.value}</p>
                </div>
                <p className="text-sm font-semibold text-gray-800">{item.progress}%</p>
              </div>
              <div className="bg-glass-200 rounded-full h-2 w-full">
                <motion.div
                  className={`h-2 rounded-full bg-gradient-to-r ${item.gradient}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${item.progress}%` }}
                  transition={{ duration: 1, delay: index * 0.15 + 0.3, ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
};

export default RankingCategorias;
