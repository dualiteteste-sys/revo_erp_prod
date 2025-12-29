import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ContaAReceber } from '@/services/contasAReceber';
import { CheckCircle2, Edit, Trash2, ArrowUpDown, Ban, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ContasAReceberTableProps {
  contas: ContaAReceber[];
  onEdit: (conta: ContaAReceber) => void;
  onReceive?: (conta: ContaAReceber) => void;
  onCancel?: (conta: ContaAReceber) => void;
  onReverse?: (conta: ContaAReceber) => void;
  onDelete: (conta: ContaAReceber) => void;
  sortBy: { column: string; ascending: boolean };
  onSort: (column: string) => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
  pago: { label: 'Pago', color: 'bg-green-100 text-green-800' },
  vencido: { label: 'Vencido', color: 'bg-red-100 text-red-800' },
  cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800' },
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

const ContasAReceberTable: React.FC<ContasAReceberTableProps> = ({
  contas,
  onEdit,
  onReceive,
  onCancel,
  onReverse,
  onDelete,
  sortBy,
  onSort,
}) => {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="descricao" label="Descrição" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="cliente_nome" label="Cliente" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="data_vencimento" label="Vencimento" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="valor" label="Valor" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="status" label="Status" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {contas.map((conta) => (
              <motion.tr
                key={conta.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{conta.descricao}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{conta.cliente_nome || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(conta.data_vencimento).toLocaleDateString('pt-BR')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(conta.valor)}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig[conta.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                    {statusConfig[conta.status]?.label || conta.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    {onReceive && (conta.status === 'pendente' || conta.status === 'vencido') ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onReceive(conta)}
                        title="Registrar recebimento"
                        aria-label="Registrar recebimento"
                        className="text-emerald-600 hover:text-emerald-900"
                      >
                        <CheckCircle2 size={18} />
                      </Button>
                    ) : null}
                    {onReverse && conta.status === 'pago' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onReverse(conta)}
                        title="Estornar recebimento"
                        aria-label="Estornar recebimento"
                        className="text-amber-600 hover:text-amber-900"
                      >
                        <RotateCcw size={18} />
                      </Button>
                    ) : null}
                    {onCancel && (conta.status === 'pendente' || conta.status === 'vencido') ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onCancel(conta)}
                        title="Cancelar"
                        aria-label="Cancelar"
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <Ban size={18} />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(conta)}
                      title="Editar"
                      aria-label="Editar"
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      <Edit size={18} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(conta)}
                      title="Excluir"
                      aria-label="Excluir"
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={18} />
                    </Button>
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

export default ContasAReceberTable;
