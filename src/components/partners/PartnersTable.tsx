import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PartnerListItem } from '../../services/partners';
import { Edit, Trash2, ArrowUpDown } from 'lucide-react';

interface PartnersTableProps {
  partners: PartnerListItem[];
  onEdit: (partner: PartnerListItem) => void;
  onDelete: (partner: PartnerListItem) => void;
  sortBy: { column: keyof PartnerListItem; ascending: boolean };
  onSort: (column: keyof PartnerListItem) => void;
}

const tipoLabels: { [key: string]: string } = {
  cliente: 'Cliente',
  fornecedor: 'Fornecedor',
  ambos: 'Ambos',
};

const SortableHeader: React.FC<{
  column: keyof PartnerListItem;
  label: string;
  sortBy: { column: keyof PartnerListItem; ascending: boolean };
  onSort: (column: keyof PartnerListItem) => void;
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

const PartnersTable: React.FC<PartnersTableProps> = ({ partners, onEdit, onDelete, sortBy, onSort }) => {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="nome" label="Nome" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {partners.map((partner) => (
              <motion.tr
                key={partner.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{partner.nome}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    partner.tipo === 'cliente' ? 'bg-blue-100 text-blue-800' :
                    partner.tipo === 'fornecedor' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-purple-100 text-purple-800'
                  }`}>
                    {tipoLabels[partner.tipo]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{partner.doc_unico || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    <button onClick={() => onEdit(partner)} className="text-indigo-600 hover:text-indigo-900"><Edit size={18} /></button>
                    <button onClick={() => onDelete(partner)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
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

export default PartnersTable;
