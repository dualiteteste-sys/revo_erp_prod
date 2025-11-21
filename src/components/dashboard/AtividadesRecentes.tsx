import React from 'react';
import { motion } from 'framer-motion';
import GlassCard from '../ui/GlassCard';

const activities = [
  { title: "Novo pedido #1234", description: "Cliente: João da Silva", time: "2 min atrás" },
  { title: "Produto esgotado", description: "Item: Cadeira Gamer XPTO", time: "15 min atrás" },
  { title: "Nota fiscal emitida", description: "NF-e 5678 para Empresa ABC", time: "30 min atrás" },
  { title: "Proposta enviada", description: "Para: Maria Souza", time: "1 hora atrás" },
  { title: "Novo cliente cadastrado", description: "Empresa XYZ Ltda.", time: "2 horas atrás" },
  { title: "Estoque atualizado", description: "Entrada de 50 unidades de Mouse Sem Fio", time: "3 horas atrás" },
];

const AtividadesRecentes: React.FC = () => {
  return (
    <GlassCard className="p-6 flex flex-col h-96">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Atividades Recentes</h3>
      <div className="flex-1 overflow-y-auto -mr-3 pr-3 scrollbar-styled">
        <div className="space-y-3">
          {activities.map((activity, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="p-3 rounded-xl bg-glass-50 backdrop-blur-sm border border-white/10 flex items-start gap-3"
            >
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">{activity.title}</p>
                <p className="text-xs text-gray-500 truncate">{activity.description}</p>
              </div>
              <p className="text-xs text-gray-400 whitespace-nowrap">{activity.time}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
};

export default AtividadesRecentes;
