import React, { useMemo, useState } from 'react';
import { RoteiroListItem } from '@/services/industriaRoteiros';
import { Edit, CheckCircle, XCircle, Package, Copy, Trash2, MoreHorizontal } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';

interface Props {
  roteiros: RoteiroListItem[];
  onEdit: (roteiro: RoteiroListItem) => void;
  onClone: (roteiro: RoteiroListItem) => void;
  onDelete: (roteiro: RoteiroListItem) => void;
}

const tipoMeta = (tipo?: string | null) => {
  if (tipo === 'beneficiamento') return { label: 'Beneficiamento', className: 'bg-purple-100 text-purple-800' };
  if (tipo === 'ambos') return { label: 'Ambos', className: 'bg-slate-100 text-slate-800' };
  return { label: 'Produção', className: 'bg-blue-100 text-blue-800' };
};

export default function RoteirosTable({ roteiros, onEdit, onClone, onDelete }: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);

  const columns: TableColumnWidthDef[] = [
    { id: 'produto', defaultWidth: 360, minWidth: 220 },
    { id: 'codigo_versao', defaultWidth: 220, minWidth: 180 },
    { id: 'tipo', defaultWidth: 160, minWidth: 140 },
    { id: 'padrao', defaultWidth: 120, minWidth: 100 },
    { id: 'status', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 160, minWidth: 140 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'industria:roteiros', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'produto', direction: 'asc' });
  const sortedRoteiros = useMemo(() => {
    return sortRows(
      roteiros,
      sort as any,
      [
        { id: 'produto', type: 'string', getValue: (r) => r.produto_nome ?? '' },
        { id: 'codigo_versao', type: 'string', getValue: (r) => `${r.codigo ?? ''} v${r.versao ?? ''}` },
        { id: 'tipo', type: 'string', getValue: (r) => tipoMeta(r.tipo_bom).label },
        { id: 'padrao', type: 'boolean', getValue: (r) => Boolean(r.padrao_para_producao || r.padrao_para_beneficiamento) },
        { id: 'status', type: 'boolean', getValue: (r) => Boolean(r.ativo) },
      ] as const
    );
  }, [roteiros, sort]);

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
          {sortedRoteiros.map(roteiro => (
            <tr
              key={roteiro.id}
              className="hover:bg-gray-50 transition-colors"
              onDoubleClick={(e) => {
                if (shouldIgnoreRowDoubleClickEvent(e as any)) return;
                cancelScheduledEdit();
                openInNewTabBestEffort(`/app/industria/roteiros?open=${encodeURIComponent(roteiro.id)}`, () => onEdit(roteiro));
              }}
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-gray-400" />
                  <a
                    href={`/app/industria/roteiros?open=${encodeURIComponent(roteiro.id)}`}
                    className="text-sm text-gray-900 font-medium hover:underline underline-offset-2"
                    onClick={(e) => {
                      if (!isPlainLeftClick(e)) return;
                      e.preventDefault();
                      scheduleEdit(() => onEdit(roteiro));
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      cancelScheduledEdit();
                      openInNewTabBestEffort(`/app/industria/roteiros?open=${encodeURIComponent(roteiro.id)}`, () => onEdit(roteiro));
                    }}
                  >
                    {roteiro.produto_nome}
                  </a>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {roteiro.codigo || '-'} <span className="text-xs text-gray-400 ml-1">v{roteiro.versao}</span>
              </td>
              <td className="px-6 py-4">
                {(() => {
                  const meta = tipoMeta(roteiro.tipo_bom);
                  return (
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${meta.className}`}>
                      {meta.label}
                    </span>
                  );
                })()}
              </td>
              <td className="px-6 py-4 text-center">
                {(roteiro.padrao_para_producao || roteiro.padrao_para_beneficiamento) && (
                  <CheckCircle size={16} className="text-green-500 mx-auto" />
                )}
              </td>
              <td className="px-6 py-4 text-center">
                {roteiro.ativo ? (
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
                    onClick={() => onEdit(roteiro)}
                    className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => onDelete(roteiro)}
                    className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-full transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setMenuId(menuId === roteiro.id ? null : roteiro.id)}
                      className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-full transition-colors"
                      title="Mais ações"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuId === roteiro.id && (
                      <div className="absolute right-0 mt-2 w-44 rounded-md bg-white shadow-lg border border-gray-200 z-10">
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                          onClick={() => {
                            setMenuId(null);
                            onClone(roteiro);
                          }}
                        >
                          <Copy size={16} /> Clonar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ))}
          {sortedRoteiros.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhum roteiro encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
