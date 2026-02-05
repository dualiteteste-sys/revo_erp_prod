import React, { useMemo, useState } from 'react';
import { VendaPedido } from '@/services/vendas';
import { Edit, Eye } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';

interface Props {
  orders: VendaPedido[];
  onEdit: (order: VendaPedido) => void;
  basePath?: string;
}

const statusColors: Record<string, string> = {
  orcamento: 'bg-gray-100 text-gray-800',
  aprovado: 'bg-green-100 text-green-800',
  concluido: 'bg-blue-100 text-blue-800',
  cancelado: 'bg-red-100 text-red-800',
};

export default function PedidosVendasTable({ orders, onEdit, basePath = '/app/vendas/pedidos' }: Props) {
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);

  const columns: TableColumnWidthDef[] = [
    { id: 'numero', defaultWidth: 120, minWidth: 90 },
    { id: 'cliente', defaultWidth: 420, minWidth: 200 },
    { id: 'emissao', defaultWidth: 160, minWidth: 140 },
    { id: 'total', defaultWidth: 160, minWidth: 140 },
    { id: 'status', defaultWidth: 160, minWidth: 140 },
    { id: 'acoes', defaultWidth: 80, minWidth: 70, maxWidth: 140 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'vendas:pedidos', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'emissao', direction: 'desc' });
  const sortedOrders = useMemo(() => {
    return sortRows(
      orders,
      sort as any,
      [
        { id: 'numero', type: 'number', getValue: (o) => o.numero },
        { id: 'cliente', type: 'string', getValue: (o) => o.cliente_nome ?? '' },
        { id: 'emissao', type: 'date', getValue: (o) => o.data_emissao },
        { id: 'total', type: 'number', getValue: (o) => o.total_geral },
        { id: 'status', type: 'string', getValue: (o) => o.status },
      ] as const
    );
  }, [orders, sort]);

  return (
    <div className="overflow-x-auto">
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
              columnId="cliente"
              label="Cliente"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="emissao"
              label="Emissão"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="total"
              label="Total"
              align="right"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="status"
              label="Status"
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
          {sortedOrders.map(order => {
            const href = `${basePath}?open=${encodeURIComponent(order.id)}`;
            return (
            <tr
              key={order.id}
              className="hover:bg-gray-50 transition-colors"
              onDoubleClick={(e) => {
                if (shouldIgnoreRowDoubleClickEvent(e)) return;
                openInNewTabBestEffort(href, () => onEdit(order));
              }}
            >
              <td className="px-6 py-4 text-sm font-medium text-gray-900">
                <a
                  href={href}
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
                    openInNewTabBestEffort(href, () => onEdit(order));
                  }}
                >
                  {order.numero}
                </a>
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">{order.cliente_nome || '-'}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{new Date(order.data_emissao).toLocaleDateString('pt-BR')}</td>
              <td className="px-6 py-4 text-sm font-semibold text-gray-700 text-right">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_geral)}
              </td>
              <td className="px-6 py-4 text-center">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${statusColors[order.status] || 'bg-gray-100'}`}>
                  {order.status}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <button 
                    onClick={() => onEdit(order)} 
                    className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors"
                    title={order.status === 'orcamento' ? "Editar" : "Visualizar"}
                >
                  {order.status === 'orcamento' ? <Edit size={18} /> : <Eye size={18} />}
                </button>
              </td>
            </tr>
            );
          })}
          {sortedOrders.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhum pedido de venda encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
