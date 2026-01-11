import React, { useMemo, useState } from 'react';
import { MaterialClienteListItem } from '@/services/industriaMateriais';
import { Edit, Trash2, Package, User, CheckCircle, XCircle } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

interface Props {
  materiais: MaterialClienteListItem[];
  onEdit: (material: MaterialClienteListItem) => void;
  onDelete: (material: MaterialClienteListItem) => void;
}

export default function MateriaisTable({ materiais, onEdit, onDelete }: Props) {
  const columns: TableColumnWidthDef[] = [
    { id: 'cliente', defaultWidth: 320, minWidth: 220 },
    { id: 'produto', defaultWidth: 360, minWidth: 240 },
    { id: 'ref_cliente', defaultWidth: 260, minWidth: 200 },
    { id: 'unidade', defaultWidth: 120, minWidth: 100 },
    { id: 'ativo', defaultWidth: 110, minWidth: 90 },
    { id: 'acoes', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'industria:materiais-cliente', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'cliente', direction: 'asc' });
  const sortedMateriais = useMemo(() => {
    return sortRows(
      materiais,
      sort as any,
      [
        { id: 'cliente', type: 'string', getValue: (m) => m.cliente_nome ?? '' },
        { id: 'produto', type: 'string', getValue: (m) => m.produto_nome ?? '' },
        { id: 'ref_cliente', type: 'string', getValue: (m) => `${m.codigo_cliente ?? ''} ${m.nome_cliente ?? ''}` },
        { id: 'unidade', type: 'string', getValue: (m) => m.unidade ?? '' },
        { id: 'ativo', type: 'boolean', getValue: (m) => Boolean(m.ativo) },
      ] as const
    );
  }, [materiais, sort]);

  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="min-w-full divide-y divide-gray-200">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh
              columnId="cliente"
              label="Cliente"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="produto"
              label="Produto Interno"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="ref_cliente"
              label="Ref. Cliente"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="unidade"
              label="Unidade"
              align="center"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="ativo"
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
          {sortedMateriais.map(item => (
            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">{item.cliente_nome}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700">{item.produto_nome}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                <div className="font-medium">{item.codigo_cliente || '-'}</div>
                <div className="text-xs text-gray-500">{item.nome_cliente}</div>
              </td>
              <td className="px-6 py-4 text-center text-sm text-gray-600">
                {item.unidade || '-'}
              </td>
              <td className="px-6 py-4 text-center">
                {item.ativo ? (
                  <CheckCircle size={18} className="text-green-500 mx-auto" title="Ativo" />
                ) : (
                  <XCircle size={18} className="text-gray-400 mx-auto" title="Inativo" />
                )}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onEdit(item)} className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => onDelete(item)} className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-full transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {sortedMateriais.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                Nenhum material encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
