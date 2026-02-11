import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ContaAReceber } from '@/services/contasAReceber';
import { CheckCircle2, Edit, Trash2, Ban, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';

interface ContasAReceberTableProps {
  contas: ContaAReceber[];
  onEdit: (conta: ContaAReceber) => void;
  onReceive?: (conta: ContaAReceber) => void;
  onCancel?: (conta: ContaAReceber) => void;
  onReverse?: (conta: ContaAReceber) => void;
  onDelete: (conta: ContaAReceber) => void;
  sortBy: { column: string; ascending: boolean };
  onSort: (column: string) => void;
  selectedIds?: Set<string>;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
  parcial: { label: 'Parcial', color: 'bg-blue-100 text-blue-800' },
  pago: { label: 'Pago', color: 'bg-green-100 text-green-800' },
  vencido: { label: 'Vencido', color: 'bg-red-100 text-red-800' },
  cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800' },
};

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const ContasAReceberTable: React.FC<ContasAReceberTableProps> = ({
  contas,
  onEdit,
  onReceive,
  onCancel,
  onReverse,
  onDelete,
  sortBy,
  onSort,
  selectedIds,
  allSelected,
  someSelected,
  onToggleSelect,
  onToggleSelectAll,
}) => {
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);

  const columns: TableColumnWidthDef[] = useMemo(() => {
    const cols: TableColumnWidthDef[] = [];
    if (onToggleSelect) cols.push({ id: 'select', defaultWidth: 56, minWidth: 56, maxWidth: 56, resizable: false });
    cols.push(
      { id: 'descricao', defaultWidth: 320, minWidth: 220 },
      { id: 'cliente_nome', defaultWidth: 260, minWidth: 200 },
      { id: 'data_vencimento', defaultWidth: 160, minWidth: 140 },
      { id: 'valor', defaultWidth: 170, minWidth: 150 },
      { id: 'status', defaultWidth: 140, minWidth: 120 },
      { id: 'acoes', defaultWidth: 180, minWidth: 160 }
    );
    return cols;
  }, [onToggleSelect]);
  const { widths, startResize } = useTableColumnWidths({ tableId: 'financeiro:contas-receber', columns });
  const sort: SortState<string> = sortBy ? { column: sortBy.column, direction: sortBy.ascending ? 'asc' : 'desc' } : null;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1040px] w-full divide-y divide-gray-200 table-fixed">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            {onToggleSelect ? (
              <th scope="col" className="px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={!!allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && !!someSelected;
                  }}
                  onChange={() => onToggleSelectAll?.()}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                />
              </th>
            ) : null}
            <ResizableSortableTh columnId="descricao" label="Descrição" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh columnId="cliente_nome" label="Cliente" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh columnId="data_vencimento" label="Vencimento" sort={sort} onSort={onSort} onResizeStart={startResize} />
            <ResizableSortableTh columnId="valor" label="Valor" sort={sort} onSort={onSort} onResizeStart={startResize} align="right" />
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
        <tbody className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {contas.map((conta) => {
              const href = `/app/financeiro/contas-a-receber?contaId=${encodeURIComponent(conta.id)}`;
              const selected = !!selectedIds?.has(conta.id);
              return (
                <motion.tr
                  key={conta.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={['hover:bg-gray-50', selected ? 'bg-blue-50/70' : ''].join(' ')}
                  onDoubleClick={(e) => {
                    if (shouldIgnoreRowDoubleClickEvent(e)) return;
                    openInNewTabBestEffort(href, () => onEdit(conta));
                  }}
                >
                {onToggleSelect ? (
                  <td className="px-4 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${conta.descricao || 'conta'}`}
                      checked={selected}
                      onChange={() => onToggleSelect(conta.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                    />
                  </td>
                ) : null}
                <td className="px-6 py-4 text-sm font-medium text-gray-900 overflow-hidden min-w-0">
                  <a
                    href={href}
                    className="hover:underline underline-offset-2 block truncate"
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
                <td className="px-6 py-4 text-sm text-gray-500 overflow-hidden min-w-0">
                  <div className="truncate">{conta.cliente_nome || '-'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {conta.data_vencimento ? new Date(conta.data_vencimento).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold text-right">
                  {brlFormatter.format(Number(conta.valor ?? 0))}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig[conta.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                    {statusConfig[conta.status]?.label || conta.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    {onReceive && (conta.status === 'pendente' || conta.status === 'vencido' || conta.status === 'parcial') ? (
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
                    {onReverse && (conta.status === 'pago' || conta.status === 'parcial') ? (
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
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
};

export default ContasAReceberTable;
