import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpDown, RotateCcw, SquarePen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Cargo } from '@/services/rh';

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

const SortableHeader: React.FC<{
  column: keyof Cargo;
  label: string;
  sortBy: SortState;
  onSort: (column: keyof Cargo) => void;
  className?: string;
}> = ({ column, label, sortBy, onSort, className }) => {
  const isSorted = sortBy.column === column;
  return (
    <th
      scope="col"
      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 ${className || ''}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-2">
        {label}
        {isSorted && <ArrowUpDown size={14} className={sortBy.ascending ? '' : 'rotate-180'} />}
      </div>
    </th>
  );
};

export default function CargosTable({
  cargos,
  onEdit,
  onToggleAtivo,
  sortBy,
  onSort,
  canEdit = true,
  canToggleAtivo = true,
}: CargosTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="nome" label="Cargo" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="setor" label="Setor" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="total_colaboradores" label="Colaboradores" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="total_competencias" label="Competências" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="ativo" label="Status" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="relative px-6 py-3">
              <span className="sr-only">Ações</span>
            </th>
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
