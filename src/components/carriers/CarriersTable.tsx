import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CarrierListItem } from '../../services/carriers';
import { Edit, Trash2, ArrowUpDown, Truck, MapPin, Clock, Star } from 'lucide-react';
import { cnpjMask, cpfMask } from '../../lib/masks';

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
      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-2">
        {label}
        {isSorted && <ArrowUpDown size={14} className={`text-blue-500 ${sortBy.ascending ? '' : 'rotate-180'}`} />}
      </div>
    </th>
  );
};

const CarriersTable: React.FC<CarriersTableProps> = ({ carriers, onEdit, onDelete, sortBy, onSort }) => {
  const formatDocument = (doc: string | null) => {
    if (!doc) return '-';
    if (doc.length <= 11) return cpfMask(doc);
    return cnpjMask(doc);
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="nome" label="Nome" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Localização</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Logística</th>
            <SortableHeader column="ativo" label="Status" sortBy={sortBy} onSort={onSort} />
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
                transition={{ duration: 0.2 }}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 relative">
                      <Truck size={20} />
                      {carrier.padrao_para_frete && (
                        <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-0.5 border border-white" title="Padrão">
                            <Star size={10} className="text-white fill-white" />
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{carrier.nome}</div>
                      {carrier.codigo && <div className="text-xs text-gray-500">Cód: {carrier.codigo}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {formatDocument(carrier.documento)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {carrier.cidade ? (
                    <div className="flex items-center gap-1">
                        <MapPin size={14} className="text-gray-400" />
                        {carrier.cidade}/{carrier.uf}
                    </div>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex flex-col gap-1">
                    <span className="capitalize font-medium">{carrier.modal_principal || '-'}</span>
                    {carrier.prazo_medio_dias && (
                        <span className="text-xs flex items-center gap-1 text-gray-400">
                            <Clock size={10} /> {carrier.prazo_medio_dias} dias
                        </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    carrier.ativo 
                      ? 'bg-green-100 text-green-800 border border-green-200' 
                      : 'bg-red-100 text-red-800 border border-red-200'
                  }`}>
                    {carrier.ativo ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-3">
                    <button 
                      onClick={() => onEdit(carrier)} 
                      className="text-indigo-600 hover:text-indigo-900 p-1.5 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>
                    <button 
                      onClick={() => onDelete(carrier)} 
                      className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-md transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </button>
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
