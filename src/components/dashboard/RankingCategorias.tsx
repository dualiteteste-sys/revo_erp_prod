import React from 'react';
import { motion } from 'framer-motion';
import { Package, TrendingUp } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { formatCurrency } from '@/lib/utils';

type TopProduct = { produto_id: string; nome: string; quantidade: number; total: number };

const gradients = [
  'from-blue-400 to-blue-600',
  'from-green-400 to-green-600',
  'from-orange-400 to-orange-600',
  'from-red-400 to-red-600',
  'from-purple-400 to-purple-600',
];

const RankingCategorias: React.FC<{ topProducts: TopProduct[]; loading?: boolean }> = ({ topProducts, loading }) => {
  const items = (topProducts ?? []).slice(0, 5);
  const max = Math.max(1, ...items.map(i => Number(i.total || 0)));

  return (
    <GlassCard className="p-6 flex flex-col h-96">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Top Produtos do Período</h3>
      <div className="flex-1 overflow-y-auto -mr-3 pr-3 scrollbar-styled" tabIndex={0} aria-label="Ranking por categoria">
        {loading ? (
          <div className="space-y-4">
            {new Array(5).fill(null).map((_, idx) => (
              <div key={idx} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-gray-500">Sem dados no período. Conclua pedidos para ver o ranking.</div>
        ) : (
          <div className="space-y-4">
            {items.map((item, index) => {
              const progress = Math.round((Number(item.total || 0) / max) * 100);
              const gradient = gradients[index % gradients.length];
              const value = formatCurrency(Math.round(Number(item.total || 0) * 100));
              return (
                <motion.div
                  key={item.produto_id ?? item.nome}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.15 }}
                >
                  <div className="flex items-center gap-4 mb-2">
                    <div className={`p-2 rounded-lg bg-gradient-to-r ${gradient}`}>
                      <Package size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{item.nome}</p>
                      <p className="text-xs text-gray-500">
                        {value} • {Number(item.quantidade || 0)} un
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-semibold text-gray-800">
                      <TrendingUp size={16} className="text-gray-400" />
                      {progress}%
                    </div>
                  </div>
                  <div className="bg-glass-200 rounded-full h-2 w-full">
                    <motion.div
                      className={`h-2 rounded-full bg-gradient-to-r ${gradient}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1, delay: index * 0.15 + 0.3, ease: 'easeOut' }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </GlassCard>
  );
};

export default RankingCategorias;
