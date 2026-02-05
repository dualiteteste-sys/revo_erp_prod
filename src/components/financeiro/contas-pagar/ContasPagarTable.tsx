import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ContaPagar } from '@/services/financeiro';
import { CheckCircle2, Edit, Trash2, Ban, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';

interface ContasPagarTableProps {
  contas: ContaPagar[];
  onEdit: (conta: ContaPagar) => void;
  onPay?: (conta: ContaPagar) => void;
  onCancel?: (conta: ContaPagar) => void;
  onReverse?: (conta: ContaPagar) => void;
  onDelete: (conta: ContaPagar) => void;
  sortBy: { column: string; ascending: boolean };
  onSort: (column: string) => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  aberta: { label: 'Aberta', color: 'bg-yellow-100 text-yellow-800' },
  parcial: { label: 'Parcial', color: 'bg-blue-100 text-blue-800' },
  paga: { label: 'Paga', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-800' },
};

const ContasPagarTable: React.FC<ContasPagarTableProps> = ({
  contas,
  onEdit,
  onPay,
  onCancel,
  onReverse,
  onDelete,
  sortBy,
  onSort,
}) => {
  const editClickTimeoutRef = React.useRef<number | null>(null);
  const scheduleEdit = (fn: () => void) => {
    if (typeof window === 'undefined') {
      fn();
      return;
    }
    if (editClickTimeoutRef.current) window.clearTimeout(editClickTimeoutRef.current);
    editClickTimeoutRef.current = window.setTimeout(() => {
      editClickTimeoutRef.current = null;
      fn();
    }, 180);
  };
  const cancelScheduledEdit = () => {
    if (typeof window === 'undefined') return;
    if (!editClickTimeoutRef.current) return;
    window.clearTimeout(editClickTimeoutRef.current);
    editClickTimeoutRef.current = null;
  };

  const columns: TableColumnWidthDef[] = [
    { id: 'descricao', defaultWidth: 320, minWidth: 220 },
    { id: 'fornecedor_nome', defaultWidth: 260, minWidth: 200 },
    { id: 'data_vencimento', defaultWidth: 160, minWidth: 140 },
    { id: 'valor_total', defaultWidth: 170, minWidth: 150 },
    { id: 'saldo', defaultWidth: 160, minWidth: 140 },
    { id: 'status', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 180, minWidth: 160 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'financeiro:contas-pagar', columns });
  const sort: SortState<string> = sortBy ? { column: sortBy.column, direction: sortBy.ascending ? 'asc' : 'desc' } : null;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1100px] w-full divide-y divide-gray-200 table-fixed">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh columnId="descricao" label="Descrição" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh columnId="fornecedor_nome" label="Fornecedor" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh columnId="data_vencimento" label="Vencimento" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh columnId="valor_total" label="Valor Total" sort={sort} onSort={onSort} onResizeStart={startResize} align="right" />
            <ResizableSortableTh columnId="saldo" label="Saldo" sort={sort} onSort={onSort} onResizeStart={startResize} align="right" />
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
            {contas.map((conta) => {
              const href = `/app/financeiro/contas-a-pagar?contaId=${encodeURIComponent(conta.id)}`;
              return (
                <motion.tr
                  key={conta.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="hover:bg-gray-50"
                  onDoubleClick={(e) => {
                    if (shouldIgnoreRowDoubleClickEvent(e)) return;
                    openInNewTabBestEffort(href, () => onEdit(conta));
                  }}
                >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <a
                    href={href}
                    className="hover:underline underline-offset-2"
                    onClick={(e) => {
                      if (!isPlainLeftClick(e)) return;
                      e.preventDefault();
                      scheduleEdit(() => onEdit(conta));
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      cancelScheduledEdit();
                      openInNewTabBestEffort(href, () => onEdit(conta));
                    }}
                  >
                    {conta.descricao}
                  </a>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{conta.fornecedor_nome || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(conta.data_vencimento).toLocaleDateString('pt-BR')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(conta.valor_total)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(conta.saldo || 0)}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig[conta.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                    {statusConfig[conta.status]?.label || conta.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    {onPay && (conta.status === 'aberta' || conta.status === 'parcial') ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onPay(conta)}
                        title="Registrar pagamento"
                        aria-label="Registrar pagamento"
                        className="text-emerald-600 hover:text-emerald-900"
                      >
                        <CheckCircle2 size={18} />
                      </Button>
                    ) : null}
                    {onReverse && conta.status === 'paga' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onReverse(conta)}
                        title="Estornar pagamento"
                        aria-label="Estornar pagamento"
                        className="text-amber-600 hover:text-amber-900"
                      >
                        <RotateCcw size={18} />
                      </Button>
                    ) : null}
                    {onCancel && (conta.status === 'aberta' || conta.status === 'parcial') ? (
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
              );
            })}
          </AnimatePresence>
        </motion.tbody>
      </table>
    </div>
  );
};

export default ContasPagarTable;
