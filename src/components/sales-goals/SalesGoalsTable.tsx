import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SalesGoal } from '@/services/salesGoals';
import { Edit, Trash2, ArrowUpDown, AlertTriangle } from 'lucide-react';

interface SalesGoalsTableProps {
  goals: SalesGoal[];
  onEdit: (goal: SalesGoal) => void;
  onDelete: (goal: SalesGoal) => void;
  sortBy: { column: string; ascending: boolean };
  onSort: (column: string) => void;
}

const statusConfig: Record<SalesGoal['status'], { label: string; color: string }> = {
  nao_iniciada: { label: 'Não Iniciada', color: 'bg-gray-100 text-gray-800' },
  em_andamento: { label: 'Em Andamento', color: 'bg-blue-100 text-blue-800' },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

const SortableHeader: React.FC<{
  column: string;
  label: string;
  sortBy: { column: string; ascending: boolean };
  onSort: (column: string) => void;
  className?: string;
}> = ({ column, label, sortBy, onSort, className }) => {
  const isSorted = sortBy.column === column;
  return (
    <th
      scope="col"
      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 ${className}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-2">
        {label}
        {isSorted && <ArrowUpDown size={14} className={sortBy.ascending ? '' : 'rotate-180'} />}
      </div>
    </th>
  );
};

const ProgressBar: React.FC<{ value: number }> = ({ value }) => {
    const progress = Math.min(100, Math.max(0, value));
    let colorClass = 'bg-blue-500';
    if (progress >= 100) {
        colorClass = 'bg-green-500';
    } else if (progress < 50) {
        colorClass = 'bg-yellow-500';
    }
    return (
        <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className={`${colorClass} h-2.5 rounded-full`} style={{ width: `${progress}%` }}></div>
        </div>
    );
};

const SalesGoalsTable: React.FC<SalesGoalsTableProps> = ({ goals, onEdit, onDelete, sortBy, onSort }) => {
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');
  const daysUntil = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="vendedor_nome" label="Vendedor" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="data_inicio" label="Período" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="valor_meta" label="Meta" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="valor_realizado" label="Realizado" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="atingimento" label="Atingimento" sortBy={sortBy} onSort={onSort} className="w-48" />
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Alerta
            </th>
            <SortableHeader column="status" label="Status" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {goals.map((goal) => (
              <motion.tr
                key={goal.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{goal.vendedor_nome}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{`${formatDate(goal.data_inicio)} - ${formatDate(goal.data_fim)}`}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{formatCurrency(goal.valor_meta)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{formatCurrency(goal.valor_realizado)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                        <ProgressBar value={goal.atingimento} />
                        <span>{goal.atingimento.toFixed(1)}%</span>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {goal.status !== 'concluida' && goal.status !== 'cancelada' && daysUntil(goal.data_fim) <= 7 && goal.atingimento < 80 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                      <AlertTriangle size={14} /> Em risco
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig[goal.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                    {statusConfig[goal.status]?.label || goal.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    <button onClick={() => onEdit(goal)} className="text-indigo-600 hover:text-indigo-900"><Edit size={18} /></button>
                    <button onClick={() => onDelete(goal)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </motion.tbody>
      </table>
    </div>
  );
};

export default SalesGoalsTable;
