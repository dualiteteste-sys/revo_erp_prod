import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, SquarePen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Cargo } from '@/services/rh';
import ResizableSortableTh, { type SortState as UiSortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

type SortState = { column: keyof Cargo; ascending: boolean };

interface CargosTableProps {
  cargos: Cargo[];
  onEdit: (cargo: Cargo) => void;
  onToggleAtivo: (cargo: Cargo) => void;
  sortBy: SortState;
  onSort: (column: keyof Cargo) => void;
  canEdit?: boolean;
  canToggleAtivo?: boolean;
}

export default function CargosTable({
  cargos,
  onEdit,
  onToggleAtivo,
  sortBy,
  onSort,
  canEdit = true,
  canToggleAtivo = true,
}: CargosTableProps) {
  const columns: TableColumnWidthDef[] = [
    { id: 'nome', defaultWidth: 300, minWidth: 220 },
    { id: 'setor', defaultWidth: 220, minWidth: 180 },
    { id: 'total_colaboradores', defaultWidth: 170, minWidth: 150 },
    { id: 'total_competencias', defaultWidth: 170, minWidth: 150 },
    { id: 'ativo', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 170, minWidth: 150 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'rh:cargos', columns });
  const sort: UiSortState<string> = sortBy ? { column: sortBy.column, direction: sortBy.ascending ? 'asc' : 'desc' } : null;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1040px] w-full divide-y divide-gray-200 table-fixed">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh columnId="nome" label="Cargo" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="setor" label="Setor" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="total_colaboradores" label="Colaboradores" sort={sort} onSort={onSort as any} onResizeStart={startResize} align="right" />
            <ResizableSortableTh columnId="total_competencias" label="Competências" sort={sort} onSort={onSort as any} onResizeStart={startResize} align="right" />
            <ResizableSortableTh columnId="ativo" label="Status" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
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
            {cargos.map((c) => (
              <motion.tr
                key={c.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{c.nome}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.setor || '—'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.total_colaboradores ?? 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.total_competencias ?? 0}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      c.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {c.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(c)}
                      title={canEdit ? 'Editar' : 'Sem permissão para editar'}
                      aria-label="Editar"
                      className="text-indigo-600 hover:text-indigo-900"
                      disabled={!canEdit}
                    >
                      <SquarePen size={18} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onToggleAtivo(c)}
                      title={
                        !canToggleAtivo
                          ? 'Sem permissão para alterar status'
                          : c.ativo
                            ? 'Inativar'
                            : 'Reativar'
                      }
                      aria-label={c.ativo ? 'Inativar' : 'Reativar'}
                      className={c.ativo ? 'text-red-600 hover:text-red-900' : 'text-blue-600 hover:text-blue-900'}
                      disabled={!canToggleAtivo}
                    >
                      {c.ativo ? <Trash2 size={18} /> : <RotateCcw size={18} />}
                    </Button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </motion.tbody>
      </table>
      {cargos.length === 0 && <div className="text-center py-10 text-gray-500">Nenhum cargo encontrado.</div>}
    </div>
  );
}
