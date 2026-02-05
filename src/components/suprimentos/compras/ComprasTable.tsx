import React, { useMemo, useState } from 'react';
import { CompraPedido } from '@/services/compras';
import { Edit, Eye } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';

interface Props {
  orders: CompraPedido[];
  onEdit: (order: CompraPedido) => void;
}

const statusColors: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-800',
  enviado: 'bg-blue-100 text-blue-800',
  recebido: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
};

export default function ComprasTable({ orders, onEdit }: Props) {
  const columns: TableColumnWidthDef[] = [
    { id: 'numero', defaultWidth: 120, minWidth: 90 },
    { id: 'fornecedor', defaultWidth: 420, minWidth: 200 },
    { id: 'data', defaultWidth: 160, minWidth: 140 },
    { id: 'total', defaultWidth: 160, minWidth: 140 },
    { id: 'status', defaultWidth: 160, minWidth: 140 },
    { id: 'acoes', defaultWidth: 80, minWidth: 70, maxWidth: 140 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'suprimentos:compras', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'data', direction: 'desc' });
  const sortedOrders = useMemo(() => {
    return sortRows(
      orders,
      sort as any,
      [
        { id: 'numero', type: 'number', getValue: (o) => o.numero },
        { id: 'fornecedor', type: 'string', getValue: (o) => o.fornecedor_nome ?? '' },
        { id: 'data', type: 'date', getValue: (o) => o.data_emissao },
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
              columnId="fornecedor"
              label="Fornecedor"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="data"
              label="Data"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="total"
              label="Total"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              align="right"
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
              className="hover:bg-gray-50"
              onDoubleClick={(e) => {
                if (shouldIgnoreRowDoubleClickEvent(e)) return;
                openInNewTabBestEffort(`/app/suprimentos/compras?open=${encodeURIComponent(order.id)}`, () => onEdit(order));
              }}
            >
              <td className="px-6 py-4 text-sm font-medium text-gray-900">#{order.numero}</td>
              <td className="px-6 py-4 text-sm text-gray-700">{order.fornecedor_nome}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{new Date(order.data_emissao).toLocaleDateString('pt-BR')}</td>
              <td className="px-6 py-4 text-sm font-semibold text-gray-700">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_geral)}
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${statusColors[order.status] || 'bg-gray-100'}`}>
                  {order.status}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <button onClick={() => onEdit(order)} className="text-blue-600 hover:text-blue-800">
                  {order.status === 'recebido' ? <Eye size={18} /> : <Edit size={18} />}
                </button>
              </td>
            </tr>
          ))}
          {sortedOrders.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhum pedido de compra encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
