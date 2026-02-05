import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SalesGoal } from '@/services/salesGoals';
import { Edit, Trash2, AlertTriangle } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';

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
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);

  const columns: TableColumnWidthDef[] = [
    { id: 'vendedor_nome', defaultWidth: 240, minWidth: 200 },
    { id: 'data_inicio', defaultWidth: 220, minWidth: 200 },
    { id: 'valor_meta', defaultWidth: 160, minWidth: 140 },
    { id: 'valor_realizado', defaultWidth: 160, minWidth: 140 },
    { id: 'atingimento', defaultWidth: 260, minWidth: 220 },
    { id: 'alerta', defaultWidth: 150, minWidth: 130 },
    { id: 'status', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'sales:goals', columns });
  const sort: SortState<string> = sortBy ? { column: sortBy.column, direction: sortBy.ascending ? 'asc' : 'desc' } : null;

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');
  const daysUntil = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1200px] w-full divide-y divide-gray-200 table-fixed">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh columnId="vendedor_nome" label="Vendedor" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh columnId="data_inicio" label="Período" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh columnId="valor_meta" label="Meta" sort={sort} onSort={onSort} onResizeStart={startResize} align="right" />
            <ResizableSortableTh columnId="valor_realizado" label="Realizado" sort={sort} onSort={onSort} onResizeStart={startResize} align="right" />
            <ResizableSortableTh columnId="atingimento" label="Atingimento" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh columnId="alerta" label="Alerta" sortable={false} onResizeStart={startResize} />
            <ResizableSortableTh columnId="status" label="Status" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh
              columnId="acoes"
              label={<span className="sr-only">Ações</span>}
              sortable={false}
              onResizeStart={startResize}
              align="right"
              className="px-6"
            />
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
                onDoubleClick={(e) => {
                  if (shouldIgnoreRowDoubleClickEvent(e)) return;
                  const href = `/app/vendas/metas?open=${encodeURIComponent(goal.id)}`;
                  openInNewTabBestEffort(href, () => onEdit(goal));
                }}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <a
                    href={`/app/vendas/metas?open=${encodeURIComponent(goal.id)}`}
                    className="hover:underline underline-offset-2"
                    onClick={(e) => {
                      if (!isPlainLeftClick(e)) return;
                      e.preventDefault();
                      scheduleEdit(() => onEdit(goal));
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      cancelScheduledEdit();
                      openInNewTabBestEffort(`/app/vendas/metas?open=${encodeURIComponent(goal.id)}`, () => onEdit(goal));
                    }}
                  >
                    {goal.vendedor_nome}
                  </a>
                </td>
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
