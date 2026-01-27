import React from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Activity, AlertCircle, AlertTriangle, Info, Clock } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import type { DashboardActivity } from '@/services/mainDashboard';

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '—';
  }
}

const levelConfig = {
  error: { 
    icon: AlertCircle, 
    bg: 'bg-gradient-to-r from-rose-50 to-pink-50', 
    border: 'border-rose-200/50',
    iconBg: 'bg-gradient-to-br from-rose-500 to-pink-600',
    dot: 'bg-rose-500'
  },
  warn: { 
    icon: AlertTriangle, 
    bg: 'bg-gradient-to-r from-amber-50 to-orange-50', 
    border: 'border-amber-200/50',
    iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    dot: 'bg-amber-500'
  },
  info: { 
    icon: Info, 
    bg: 'bg-gradient-to-r from-blue-50 to-indigo-50', 
    border: 'border-blue-200/50',
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    dot: 'bg-blue-500'
  },
};

const AtividadesRecentes: React.FC<{ activities: DashboardActivity[]; loading?: boolean }> = ({ activities, loading }) => {
  return (
    <div className="h-full flex flex-col p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100">
          <Activity size={16} className="text-blue-600" />
        </div>
        <h3 className="font-semibold text-slate-800">Atividades Recentes</h3>
      </div>

      {loading ? (
        <div className="flex-1 space-y-3">
          {[...Array(6)].map((_, idx) => (
            <div key={idx} className="h-16 rounded-xl bg-gradient-to-r from-slate-100 to-slate-50 animate-pulse" />
          ))}
        </div>
      ) : (activities?.length ?? 0) === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
              <Activity size={24} className="text-slate-400" />
            </div>
            <p className="text-sm text-slate-400">Sem atividades recentes</p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 -mr-2 pr-2">
          <div className="space-y-2">
            {activities.map((activity, index) => {
              const config = levelConfig[activity.level] || levelConfig.info;
              const Icon = config.icon;
              
              return (
                <motion.div
                  key={activity.id ?? index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`p-3 rounded-xl ${config.bg} border ${config.border} flex items-start gap-3 hover:shadow-md transition-all duration-300 group`}
                >
                  <div className={`p-2 rounded-lg ${config.iconBg} text-white shadow-lg flex-shrink-0`}>
                    <Icon size={14} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 line-clamp-2 group-hover:text-slate-900 transition-colors">
                      {activity.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400 truncate">{activity.event}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs text-slate-400 whitespace-nowrap flex items-center gap-1">
                        <Clock size={10} />
                        {timeAgo(activity.created_at)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default AtividadesRecentes;
