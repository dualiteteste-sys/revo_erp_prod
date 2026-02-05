import React, { useMemo, useState } from 'react';
import { OrdemProducao } from '@/services/industriaProducao';
import { Edit, Eye, Calendar, Package, Trash2 } from 'lucide-react';
import { formatOrderNumber } from '@/lib/utils';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';

interface Props {
  orders: OrdemProducao[];
  onEdit: (order: OrdemProducao) => void;
  onDelete: (id: string) => void;
}

const statusColors: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-800',
  planejada: 'bg-blue-100 text-blue-800',
  em_programacao: 'bg-indigo-100 text-indigo-800',
  em_producao: 'bg-yellow-100 text-yellow-800',
  em_inspecao: 'bg-purple-100 text-purple-800',
  concluida: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
};

const formatStatus = (status: string) => {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export default function ProducaoTable({ orders, onEdit, onDelete }: Props) {
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);
  const columns: TableColumnWidthDef[] = [
    { id: 'numero', defaultWidth: 140, minWidth: 110 },
    { id: 'produto', defaultWidth: 360, minWidth: 220 },
    { id: 'qtd', defaultWidth: 130, minWidth: 120 },
    { id: 'entregue', defaultWidth: 120, minWidth: 110 },
    { id: 'percentual', defaultWidth: 100, minWidth: 90 },
    { id: 'previsao', defaultWidth: 170, minWidth: 150 },
    { id: 'status', defaultWidth: 180, minWidth: 160 },
    { id: 'acoes', defaultWidth: 160, minWidth: 140 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'industria:producao', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'numero', direction: 'desc' });
  const sortedOrders = useMemo(() => {
    return sortRows(
      orders,
      sort as any,
      [
        { id: 'numero', type: 'number', getValue: (o) => o.numero ?? 0 },
        { id: 'produto', type: 'string', getValue: (o) => o.produto_nome ?? '' },
        { id: 'qtd', type: 'number', getValue: (o) => o.quantidade_planejada ?? 0 },
        { id: 'entregue', type: 'number', getValue: (o) => o.total_entregue ?? 0 },
        { id: 'percentual', type: 'number', getValue: (o) => o.percentual_concluido ?? 0 },
        { id: 'previsao', type: 'date', getValue: (o) => o.data_prevista_entrega ?? null },
        { id: 'status', type: 'string', getValue: (o) => formatStatus(String(o.status ?? '')) },
      ] as const
    );
  }, [orders, sort]);

  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="min-w-full divide-y divide-gray-200">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh
              columnId="numero"
              label="Número"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="produto"
              label="Produto"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="qtd"
              label="Qtd. Plan."
              align="center"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="entregue"
              label="Entregue"
              align="center"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="percentual"
              label="%"
              align="center"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="previsao"
              label="Previsão"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="status"
              label="Status"
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
          {sortedOrders.map(order => (
            <tr
              key={order.id}
              className="hover:bg-gray-50 transition-colors"
              onDoubleClick={(e) => {
                if (shouldIgnoreRowDoubleClickEvent(e as any)) return;
                cancelScheduledEdit();
                openInNewTabBestEffort(`/app/industria/producao?open=${encodeURIComponent(order.id)}`, () => onEdit(order));
              }}
            >
              <td className="px-6 py-4 text-sm font-medium text-gray-900">
                <a
                  href={`/app/industria/producao?open=${encodeURIComponent(order.id)}`}
                  className="hover:underline underline-offset-2"
                  onClick={(e) => {
                    if (!isPlainLeftClick(e)) return;
                    e.preventDefault();
                    scheduleEdit(() => onEdit(order));
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelScheduledEdit();
                    openInNewTabBestEffort(`/app/industria/producao?open=${encodeURIComponent(order.id)}`, () => onEdit(order));
                  }}
                >
                  {formatOrderNumber(order.numero)}
                </a>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700 font-medium">{order.produto_nome}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-center text-gray-700">
                {order.quantidade_planejada} <span className="text-xs text-gray-500">{order.unidade}</span>
              </td>
              <td className="px-6 py-4 text-center">
                <span className="text-sm font-semibold text-gray-700">{order.total_entregue}</span>
              </td>
              <td className="px-6 py-4 text-center">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${order.percentual_concluido >= 100 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {order.percentual_concluido}%
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500">
                {order.data_prevista_entrega ? (
                  <div className="flex items-center gap-1">
                    <Calendar size={14} />
                    {new Date(order.data_prevista_entrega).toLocaleDateString('pt-BR')}
                  </div>
                ) : '-'}
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${statusColors[order.status] || 'bg-gray-100'}`}>
                  {formatStatus(order.status)}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onEdit(order)} className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors" title="Editar / Visualizar">
                    {order.status === 'concluida' || order.status === 'cancelada' ? <Eye size={18} /> : <Edit size={18} />}
                  </button>
                  {order.status !== 'concluida' && order.status !== 'cancelada' && (
                    <button onClick={() => onDelete(order.id)} className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors" title="Excluir">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {sortedOrders.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-12 text-center text-gray-500">Nenhuma ordem de produção encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
