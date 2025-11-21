import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CarrierListItem } from '../../services/carriers';
import { Edit, Trash2, ArrowUpDown } from 'lucide-react';
import { cnpjMask } from '../../lib/masks';

interface CarriersTableProps {
  carriers: CarrierListItem[];
  onEdit: (carrier: CarrierListItem) => void;
  onDelete: (carrier: CarrierListItem) => void;
  sortBy: { column: keyof CarrierListItem; ascending: boolean };
  onSort: (column: keyof CarrierListItem) => void;
}

const SortableHeader: React.FC<{
  column: keyof CarrierListItem;
  label: string;
  sortBy: { column: keyof CarrierListItem; ascending: boolean };
  onSort: (column: keyof CarrierListItem) => void;
  className?: string;
}> = ({ column, label, sortBy, onSort, className }) => {
  const isSorted = sortBy.column === column;
  return (
    <th
      scope="col"
      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 ${className}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-2">
        {label}
        {isSorted && <ArrowUpDown size={14} className={sortBy.ascending ? '' : 'rotate-180'} />}
      </div>
    </th>
  );
};

const CarriersTable: React.FC<CarriersTableProps> = ({ carriers, onEdit, onDelete, sortBy, onSort }) => {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="nome_razao_social" label="Nome/Razão Social" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CNPJ</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inscrição Estadual</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {carriers.map((carrier) => (
              <motion.tr
                key={carrier.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{carrier.nome_razao_social}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{carrier.cnpj ? cnpjMask(carrier.cnpj) : '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{carrier.inscr_estadual || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    carrier.status === 'ativa' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {carrier.status === 'ativa' ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    <button onClick={() => onEdit(carrier)} className="text-indigo-600 hover:text-indigo-900"><Edit size={18} /></button>
                    <button onClick={() => onDelete(carrier)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
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

export default CarriersTable;
