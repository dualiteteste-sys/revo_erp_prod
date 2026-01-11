// src/components/services/ServicesTable.tsx
import React from 'react';
import { Edit, Trash2, Copy } from 'lucide-react';
import { Service } from '@/services/services';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

type Props = {
  services: Service[];
  onEdit: (s: Service) => void;
  onDelete: (s: Service) => void;
  onClone: (s: Service) => void;
  sortBy: { column: keyof Service; ascending: boolean };
  onSort: (column: keyof Service) => void;
  selectedIds?: Set<string>;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
};

export default function ServicesTable({
  services,
  onEdit,
  onDelete,
  onClone,
  sortBy,
  onSort,
  selectedIds,
  allSelected,
  someSelected,
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const columns: TableColumnWidthDef[] = [
    ...(onToggleSelect ? [{ id: 'select', defaultWidth: 56, minWidth: 56, maxWidth: 56, resizable: false }] : []),
    { id: 'descricao', defaultWidth: 360, minWidth: 220 },
    { id: 'codigo', defaultWidth: 160, minWidth: 120 },
    { id: 'preco_venda', defaultWidth: 160, minWidth: 140 },
    { id: 'unidade', defaultWidth: 130, minWidth: 110 },
    { id: 'status', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 180, minWidth: 140 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'services:list', columns });
  const sort: SortState<string> = sortBy ? { column: sortBy.column, direction: sortBy.ascending ? 'asc' : 'desc' } : null;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[980px] w-full divide-y divide-gray-200 table-fixed">
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
            <ResizableSortableTh columnId="descricao" label="Descrição" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="codigo" label="Código" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="preco_venda" label="Preço" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="unidade" label="Unidade" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="status" label="Status" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
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
          {services.map((s) => (
            <tr key={s.id}>
              {onToggleSelect ? (
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${s.descricao || 'serviço'}`}
                    checked={!!selectedIds?.has(s.id)}
                    onChange={() => onToggleSelect(s.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                  />
                </td>
              ) : null}
              <td className="px-6 py-4 text-sm text-gray-900">{s.descricao}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{s.codigo || '—'}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{s.preco_venda ? formatCurrency(Math.round(Number(s.preco_venda) * 100)) : '—'}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{s.unidade ?? '—'}</td>
              <td className="px-6 py-4 text-sm">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${s.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {s.status}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onClone(s)}
                    title="Clonar"
                    aria-label="Clonar"
                    className="text-blue-600 hover:text-blue-900"
                  >
                    <Copy size={18} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(s)}
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
                    onClick={() => onDelete(s)}
                    title="Remover"
                    aria-label="Remover"
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {services.length === 0 && (
            <tr>
              <td colSpan={onToggleSelect ? 7 : 6} className="px-6 py-16 text-center text-gray-400">
                Nenhum serviço encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
