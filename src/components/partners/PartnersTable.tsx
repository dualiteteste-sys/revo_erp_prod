import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PartnerListItem } from '../../services/partners';
import { Edit, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { documentMask } from '@/lib/masks';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';

interface PartnersTableProps {
  partners: PartnerListItem[];
  onEdit: (partner: PartnerListItem) => void;
  onDelete: (partner: PartnerListItem) => void;
  onRestore?: (partner: PartnerListItem) => void;
  sortBy: { column: keyof PartnerListItem; ascending: boolean };
  onSort: (column: keyof PartnerListItem) => void;
  selectedIds?: Set<string>;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

const tipoLabels: { [key: string]: string } = {
  cliente: 'Cliente',
  fornecedor: 'Fornecedor',
  ambos: 'Ambos',
};

const PartnersTable: React.FC<PartnersTableProps> = ({
  partners,
  onEdit,
  onDelete,
  onRestore,
  sortBy,
  onSort,
  selectedIds,
  allSelected,
  someSelected,
  onToggleSelect,
  onToggleSelectAll,
}) => {
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);

  const columns: TableColumnWidthDef[] = [
    ...(onToggleSelect ? [{ id: 'select', defaultWidth: 56, minWidth: 56, maxWidth: 56, resizable: false }] : []),
    { id: 'nome', defaultWidth: 360, minWidth: 220 },
    { id: 'tipo', defaultWidth: 160, minWidth: 140 },
    { id: 'doc_unico', defaultWidth: 180, minWidth: 160 },
    { id: 'deleted_at', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 170, minWidth: 140 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'partners:list', columns });
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
            <ResizableSortableTh columnId="nome" label="Nome" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="tipo" label="Tipo" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="doc_unico" label="Documento" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="deleted_at" label="Status" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
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
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {partners.map((partner) => {
              const href = `/app/partners?open=${encodeURIComponent(partner.id)}`;
              return (
                <motion.tr
                  key={partner.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="hover:bg-gray-50"
                  onDoubleClick={(e) => {
                    if (shouldIgnoreRowDoubleClickEvent(e)) return;
                    openInNewTabBestEffort(href, () => onEdit(partner));
                  }}
                >
                {onToggleSelect ? (
                  <td className="px-4 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${partner.nome || 'parceiro'}`}
                      checked={!!selectedIds?.has(partner.id)}
                      onChange={() => onToggleSelect(partner.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                    />
                  </td>
                ) : null}
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <a
                    href={href}
                    className="hover:underline underline-offset-2"
                    onClick={(e) => {
                      if (!isPlainLeftClick(e)) return;
                      e.preventDefault();
                      scheduleEdit(() => onEdit(partner));
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      cancelScheduledEdit();
                      openInNewTabBestEffort(href, () => onEdit(partner));
                    }}
                  >
                    {partner.nome}
                  </a>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    partner.tipo === 'cliente' ? 'bg-blue-100 text-blue-800' :
                    partner.tipo === 'fornecedor' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-purple-100 text-purple-800'
                  }`}>
                    {tipoLabels[partner.tipo]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{partner.doc_unico ? documentMask(partner.doc_unico) : '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    partner.deleted_at ? 'bg-gray-100 text-gray-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {partner.deleted_at ? 'Inativo' : 'Ativo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(partner)}
                      title="Editar"
                      aria-label="Editar"
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      <Edit size={18} />
                    </Button>
                    {partner.deleted_at ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onRestore?.(partner)}
                        title="Reativar"
                        aria-label="Reativar"
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <RotateCcw size={18} />
                      </Button>
                    ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(partner)}
                      title="Inativar"
                      aria-label="Inativar"
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={18} />
                    </Button>
                    )}
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

export default PartnersTable;
