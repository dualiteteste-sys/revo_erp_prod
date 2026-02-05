import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit, Trash2, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import type { ProductsTreeRow } from '@/hooks/useProductsTree';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';

interface ProductsTableProps {
  rows: ProductsTreeRow[];
  onEdit: (product: { id: string }) => void;
  onDelete: (product: { id: string }) => void;
  onClone: (product: { id: string }) => void;
  sortBy: { column: 'nome'; ascending: boolean };
  onSort: (column: 'nome') => void;
  expandedParentIds: Set<string>;
  onToggleExpand: (parentId: string) => void;
  highlightedChildIds: Set<string>;
  selectedIds?: Set<string>;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

const ProductsTable: React.FC<ProductsTableProps> = ({
  rows,
  onEdit,
  onDelete,
  onClone,
  sortBy,
  onSort,
  expandedParentIds,
  onToggleExpand,
  highlightedChildIds,
  selectedIds,
  allSelected,
  someSelected,
  onToggleSelect,
  onToggleSelectAll,
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
    ...(onToggleSelect ? [{ id: 'select', defaultWidth: 56, minWidth: 56, maxWidth: 56, resizable: false }] : []),
    { id: 'nome', defaultWidth: 360, minWidth: 220 },
    { id: 'sku', defaultWidth: 160, minWidth: 120 },
    { id: 'preco_venda', defaultWidth: 160, minWidth: 140 },
    { id: 'unidade', defaultWidth: 140, minWidth: 110 },
    { id: 'status', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 160, minWidth: 120 },
  ];

  const { widths, startResize } = useTableColumnWidths({ tableId: 'products:list', columns });

  const sort: SortState<string> = sortBy
    ? { column: sortBy.column, direction: sortBy.ascending ? 'asc' : 'desc' }
    : null;

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
            <ResizableSortableTh columnId="nome" label="Nome" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="sku" label="SKU" sortable={false} sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="preco_venda" label="Preço" sortable={false} sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="unidade" label="Unidade" sortable={false} sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="status" label="Status" sortable={false} sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh
              columnId="acoes"
              label={<span className="sr-only">Ações</span>}
              sortable={false}
              resizable
              onResizeStart={startResize}
              align="right"
              className="px-6"
            />
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {rows.map((row) => {
              const isParent = row.rowType === 'parent';
              const hasChildren = isParent && (row.children_count ?? 0) > 0;
              const isExpanded = hasChildren && expandedParentIds.has(row.id);
              const isVariant = row.rowType === 'variant';
              const isHighlighted = isVariant && highlightedChildIds.has(row.id);
              const sku = row.sku ?? '';
              const nome = row.nome ?? '';
              const atributosSummary = isVariant ? (row.atributos_summary ?? null) : null;
              const href = `/app/products?open=${encodeURIComponent(row.id)}`;

              return (
              <motion.tr
                key={row.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={[
                  'hover:bg-gray-50',
                  isHighlighted ? 'bg-blue-50/70' : '',
                ].join(' ')}
                onDoubleClick={(e) => {
                  if (shouldIgnoreRowDoubleClickEvent(e)) return;
                  openInNewTabBestEffort(href, () => onEdit({ id: row.id }));
                }}
              >
                {onToggleSelect ? (
                  <td className="px-4 py-4 whitespace-nowrap">
                    {isParent ? (
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${nome || 'produto'}`}
                        checked={!!selectedIds?.has(row.id)}
                        onChange={() => onToggleSelect(row.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                      />
                    ) : (
                      <span className="inline-block h-4 w-4" />
                    )}
                  </td>
                ) : null}

                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    {hasChildren ? (
                      <button
                        type="button"
                        className="h-7 w-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                        aria-label={isExpanded ? 'Recolher variações' : 'Expandir variações'}
                        onClick={() => onToggleExpand(row.id)}
                      >
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                    ) : (
                      <span className="inline-block h-7 w-7" />
                    )}

                    <div className={isVariant ? 'relative pl-5' : ''}>
                      {isVariant ? (
                        <span className="absolute left-0 top-1 bottom-1 w-px bg-gray-200" aria-hidden />
                      ) : null}

                      <div className="flex items-center gap-2">
                        <a
                          href={href}
                          className={[isVariant ? 'text-gray-900' : '', 'hover:underline underline-offset-2'].join(' ')}
                          onClick={(e) => {
                            if (!isPlainLeftClick(e)) return;
                            e.preventDefault();
                            scheduleEdit(() => onEdit({ id: row.id }));
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            cancelScheduledEdit();
                            openInNewTabBestEffort(href, () => onEdit({ id: row.id }));
                          }}
                        >
                          {nome}
                        </a>

                        {hasChildren ? (
                          <>
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                              Pai
                            </span>
                            <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                              {(row.children_count ?? 0)} variação(ões)
                            </span>
                          </>
                        ) : null}

                        {isVariant ? (
                          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-gray-50 text-gray-700 border border-gray-200">
                            Variação
                          </span>
                        ) : null}
                      </div>

                      {isVariant && (atributosSummary || sku) ? (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {atributosSummary ?? `SKU: ${sku}`}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sku}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.preco_venda ?? 0)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.unidade}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      row.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {row.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    <button onClick={() => onClone({ id: row.id })} className="text-blue-600 hover:text-blue-900" title="Clonar produto">
                      <Copy size={18} />
                    </button>
                    <button onClick={() => onEdit({ id: row.id })} className="text-indigo-600 hover:text-indigo-900" title="Editar produto">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => onDelete({ id: row.id })} className="text-red-600 hover:text-red-900" title="Excluir produto">
                      <Trash2 size={18} />
                    </button>
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

export default ProductsTable;
