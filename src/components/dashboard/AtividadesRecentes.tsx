import React from 'react';
import { motion } from 'framer-motion';
import GlassCard from '../ui/GlassCard';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DashboardActivity } from '@/services/mainDashboard';

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '—';
  }
}

const AtividadesRecentes: React.FC<{ activities: DashboardActivity[]; loading?: boolean }> = ({ activities, loading }) => {
  return (
    <GlassCard className="p-6 flex flex-col h-96">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Atividades Recentes</h3>
      <div className="flex-1 overflow-y-auto -mr-3 pr-3 scrollbar-styled" tabIndex={0} aria-label="Lista de atividades recentes">
        {loading ? (
          <div className="space-y-3">
            {new Array(8).fill(null).map((_, idx) => (
              <div key={idx} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (activities?.length ?? 0) === 0 ? (
          <div className="text-sm text-gray-500">Sem atividades recentes.</div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity, index) => (
              <motion.div
                key={activity.id ?? index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="p-3 rounded-xl bg-glass-50 backdrop-blur-sm border border-white/10 flex items-start gap-3"
              >
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    activity.level === 'error' ? 'bg-red-500' : activity.level === 'warn' ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{activity.message}</p>
                  <p className="text-xs text-gray-500 truncate">{activity.event}</p>
                </div>
                <p className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(activity.created_at)}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
};

export default AtividadesRecentes;
