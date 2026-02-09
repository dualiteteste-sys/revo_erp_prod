import React, { useMemo, useState } from 'react';
import { Movimentacao } from '@/services/treasury';
import { Edit, Trash2, CheckCircle, Circle } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';
import { formatDatePtBR } from '@/lib/dateDisplay';

interface Props {
  movimentacoes: Movimentacao[];
  onEdit: (mov: Movimentacao) => void;
  onDelete: (mov: Movimentacao) => void;
}

export default function MovimentacoesTable({ movimentacoes, onEdit, onDelete }: Props) {
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);

  const columns: TableColumnWidthDef[] = [
    { id: 'data', defaultWidth: 160, minWidth: 140 },
    { id: 'descricao', defaultWidth: 520, minWidth: 240 },
    { id: 'entrada', defaultWidth: 150, minWidth: 130 },
    { id: 'saida', defaultWidth: 150, minWidth: 130 },
    { id: 'saldo', defaultWidth: 150, minWidth: 130 },
    { id: 'conciliado', defaultWidth: 110, minWidth: 90 },
    { id: 'acoes', defaultWidth: 120, minWidth: 90, maxWidth: 180 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'financeiro:tesouraria:movs', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'data', direction: 'desc' });
  const sortedMovs = useMemo(() => {
    return sortRows(
      movimentacoes,
      sort as any,
      [
        { id: 'data', type: 'date', getValue: (m) => m.data_movimento },
        { id: 'descricao', type: 'string', getValue: (m) => m.descricao ?? '' },
        { id: 'entrada', type: 'number', getValue: (m) => m.valor_entrada ?? 0 },
        { id: 'saida', type: 'number', getValue: (m) => m.valor_saida ?? 0 },
        { id: 'saldo', type: 'number', getValue: (m) => m.saldo_acumulado ?? 0 },
        { id: 'conciliado', type: 'boolean', getValue: (m) => Boolean(m.conciliado) },
      ] as const
    );
  }, [movimentacoes, sort]);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh
              columnId="data"
              label="Data"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="descricao"
              label="Descrição"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="entrada"
              label="Entrada"
              align="right"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="saida"
              label="Saída"
              align="right"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="saldo"
              label="Saldo"
              align="right"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="conciliado"
              label="Conc."
              align="center"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="acoes"
              label="Ações"
              align="right"
              sortable={false}
              resizable
              onResizeStart={startResize as any}
            />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedMovs.map((mov) => {
            const href = `/app/financeiro/tesouraria?tab=movimentos&open=${encodeURIComponent(mov.id)}`;
            const canEdit = !mov.conciliado;
            return (
              <tr
                key={mov.id}
                className="hover:bg-gray-50"
                onDoubleClick={(e) => {
                  if (shouldIgnoreRowDoubleClickEvent(e)) return;
                  openInNewTabBestEffort(href, () => onEdit(mov));
                }}
	              >
	              <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
	                {formatDatePtBR(mov.data_movimento)}
	              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900 font-medium">
                  <a
                    href={href}
                    className={`underline-offset-2 ${canEdit ? 'hover:underline' : 'text-gray-900/90 hover:underline'}`}
                    onClick={(e) => {
                      if (!isPlainLeftClick(e)) return;
                      e.preventDefault();
                      scheduleEdit(() => onEdit(mov));
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      cancelScheduledEdit();
                      openInNewTabBestEffort(href, () => onEdit(mov));
                    }}
                    title={canEdit ? 'Editar movimentação' : 'Visualizar movimentação'}
                  >
                    {mov.descricao}
                  </a>
                </div>
                <div className="text-xs text-gray-500">
                  {mov.categoria && <span className="mr-2 bg-gray-100 px-1 rounded">{mov.categoria}</span>}
                  {mov.documento_ref && <span>Doc: {mov.documento_ref}</span>}
                </div>
              </td>
              <td className="px-6 py-4 text-right text-sm text-green-600 font-medium">
                {mov.valor_entrada ? new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(mov.valor_entrada) : ''}
              </td>
              <td className="px-6 py-4 text-right text-sm text-red-600 font-medium">
                {mov.valor_saida ? new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(mov.valor_saida) : ''}
              </td>
              <td className="px-6 py-4 text-right text-sm font-bold text-gray-800">
                {mov.saldo_acumulado !== undefined ? new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(mov.saldo_acumulado) : '-'}
              </td>
              <td className="px-6 py-4 text-center">
                {mov.conciliado ? (
                  <span title="Conciliado"><CheckCircle size={16} className="text-green-500 mx-auto" /></span>
                ) : (
                  <span title="Pendente"><Circle size={16} className="text-gray-300 mx-auto" /></span>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                {!mov.conciliado && (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => onEdit(mov)} className="text-blue-600 hover:text-blue-800 p-1">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => onDelete(mov)} className="text-red-600 hover:text-red-800 p-1">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
            );
          })}
          {sortedMovs.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-gray-500">Nenhuma movimentação no período.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
