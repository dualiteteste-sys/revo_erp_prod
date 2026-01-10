import React, { useMemo, useState } from 'react';
import { BomListItem } from '@/services/industriaBom';
import { Edit, CheckCircle, XCircle, Package, Copy, Trash2, MoreHorizontal } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

interface Props {
  boms: BomListItem[];
  onEdit: (bom: BomListItem) => void;
  onClone?: (bom: BomListItem) => void;
  onDelete?: (bom: BomListItem) => void;
}

const tipoMeta = (tipo?: string | null) => {
  if (tipo === 'beneficiamento') return { label: 'Beneficiamento', className: 'bg-purple-100 text-purple-800' };
  if (tipo === 'ambos') return { label: 'Ambos', className: 'bg-slate-100 text-slate-800' };
  return { label: 'Produção', className: 'bg-blue-100 text-blue-800' };
};

export default function BomsTable({ boms, onEdit, onClone, onDelete }: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);

  const columns: TableColumnWidthDef[] = [
    { id: 'produto', defaultWidth: 360, minWidth: 220 },
    { id: 'codigo_versao', defaultWidth: 220, minWidth: 180 },
    { id: 'tipo', defaultWidth: 160, minWidth: 140 },
    { id: 'padrao', defaultWidth: 120, minWidth: 100 },
    { id: 'status', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 160, minWidth: 140 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'industria:boms', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'produto', direction: 'asc' });
  const sortedBoms = useMemo(() => {
    return sortRows(
      boms,
      sort as any,
      [
        { id: 'produto', type: 'string', getValue: (b) => b.produto_nome ?? '' },
        { id: 'codigo_versao', type: 'string', getValue: (b) => `${b.codigo ?? ''} v${b.versao ?? ''}` },
        { id: 'tipo', type: 'string', getValue: (b) => tipoMeta(b.tipo_bom).label },
        { id: 'padrao', type: 'boolean', getValue: (b) => Boolean(b.padrao_para_producao || b.padrao_para_beneficiamento) },
        { id: 'status', type: 'boolean', getValue: (b) => Boolean(b.ativo) },
      ] as const
    );
  }, [boms, sort]);

  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="min-w-full divide-y divide-gray-200">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh
              columnId="produto"
              label="Produto"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="codigo_versao"
              label="Código / Versão"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="tipo"
              label="Tipo"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="padrao"
              label="Padrão"
              align="center"
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
          {sortedBoms.map(bom => (
            <tr key={bom.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-900 font-medium">{bom.produto_nome}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {bom.codigo || '-'} <span className="text-xs text-gray-400 ml-1">v{bom.versao}</span>
              </td>
              <td className="px-6 py-4">
                {(() => {
                  const meta = tipoMeta(bom.tipo_bom);
                  return (
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${meta.className}`}>
                      {meta.label}
                    </span>
                  );
                })()}
              </td>
              <td className="px-6 py-4 text-center">
                {(bom.padrao_para_producao || bom.padrao_para_beneficiamento) && (
                  <CheckCircle size={16} className="text-green-500 mx-auto" />
                )}
              </td>
              <td className="px-6 py-4 text-center">
                {bom.ativo ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    Inativo
                  </span>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onEdit(bom)}
                    className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors"
                    title="Editar"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => onDelete && onDelete(bom)}
                    className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                  {(onClone || onDelete) && (
                    <div className="relative">
                      <button
                        onClick={() => setMenuId(menuId === bom.id ? null : bom.id)}
                        className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Mais ações"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {menuId === bom.id && (
                        <div className="absolute right-0 mt-2 w-48 rounded-md bg-white shadow-lg border border-gray-200 z-10">
                          {onClone && (
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                              onClick={() => {
                                setMenuId(null);
                                onClone(bom);
                              }}
                            >
                              <Copy size={16} /> Clonar FT
                            </button>
                          )}
                          {onDelete && (
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-700 hover:bg-gray-100"
                              onClick={() => {
                                setMenuId(null);
                                onDelete(bom);
                              }}
                            >
                              <Trash2 size={16} /> Excluir FT
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {sortedBoms.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhuma ficha técnica encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
