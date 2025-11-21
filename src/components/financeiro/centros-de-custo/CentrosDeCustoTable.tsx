import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CentroDeCustoListItem } from '@/services/centrosDeCusto';
import { Edit, Trash2, ArrowUpDown } from 'lucide-react';

interface CentrosDeCustoTableProps {
  centros: CentroDeCustoListItem[];
  onEdit: (centro: CentroDeCustoListItem) => void;
  onDelete: (centro: CentroDeCustoListItem) => void;
  sortBy: { column: string; ascending: boolean };
  onSort: (column: string) => void;
}

const SortableHeader: React.FC<{
  column: string;
  label: string;
  sortBy: { column: string; ascending: boolean };
  onSort: (column: string) => void;
}> = ({ column, label, sortBy, onSort }) => {
  const isSorted = sortBy.column === column;
  return (
    <th
      scope="col"
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-2">
        {label}
        {isSorted && <ArrowUpDown size={14} className={sortBy.ascending ? '' : 'rotate-180'} />}
      </div>
    </th>
  );
};

const CentrosDeCustoTable: React.FC<CentrosDeCustoTableProps> = ({ centros, onEdit, onDelete, sortBy, onSort }) => {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="nome" label="Nome" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="codigo" label="Código" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="status" label="Status" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {centros.map((centro) => (
              <motion.tr
                key={centro.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{centro.nome}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{centro.codigo || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    centro.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {centro.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    <button onClick={() => onEdit(centro)} className="text-indigo-600 hover:text-indigo-900"><Edit size={18} /></button>
                    <button onClick={() => onDelete(centro)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </motion.tbody>
      </table>
    </div>
  );
};

export default CentrosDeCustoTable;
