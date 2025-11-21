import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrdemServico } from '@/services/os';
import { Edit, Trash2, ArrowUpDown, GripVertical } from 'lucide-react';
import { Database } from '@/types/database.types';
import { Droppable, Draggable } from '@hello-pangea/dnd';

interface OsTableProps {
  serviceOrders: OrdemServico[];
  onEdit: (os: OrdemServico) => void;
  onDelete: (os: OrdemServico) => void;
  sortBy: { column: keyof OrdemServico; ascending: boolean };
  onSort: (column: keyof OrdemServico) => void;
}

const statusConfig: Record<Database['public']['Enums']['status_os'], { label: string; color: string }> = {
  orcamento: { label: 'Orçamento', color: 'bg-gray-100 text-gray-800' },
  aberta: { label: 'Aberta', color: 'bg-blue-100 text-blue-800' },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

const SortableHeader: React.FC<{
  column: keyof OrdemServico;
  label: string;
  sortBy: { column: keyof OrdemServico; ascending: boolean };
  onSort: (column: keyof OrdemServico) => void;
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
        {sortBy.column === 'ordem' && column === 'ordem' 
          ? <span className="text-blue-600 font-bold text-xs">(Manual)</span>
          : isSorted && <ArrowUpDown size={14} className={sortBy.ascending ? '' : 'rotate-180'} />
        }
      </div>
    </th>
  );
};

const OsTable: React.FC<OsTableProps> = ({ serviceOrders, onEdit, onDelete, sortBy, onSort }) => {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="ordem" label="" sortBy={sortBy} onSort={onSort} className="w-12" />
            <SortableHeader column="numero" label="Nº" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="cliente_nome" label="Cliente / Descrição" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="status" label="Status" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="data_inicio" label="Data Início" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="total_geral" label="Total" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <Droppable droppableId="os-table-droppable">
            {(provided) => (
                <tbody ref={provided.innerRef} {...provided.droppableProps} className="bg-white divide-y divide-gray-200">
                    <AnimatePresence>
                        {serviceOrders.map((os, index) => (
                            <Draggable key={os.id} draggableId={os.id} index={index}>
                                {(provided, snapshot) => (
                                    <motion.tr
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={`hover:bg-gray-50 ${snapshot.isDragging ? 'bg-blue-50 shadow-lg' : ''}`}
                                    >
                                        <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-400 cursor-grab" {...provided.dragHandleProps}>
                                            <GripVertical className="mx-auto" />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{os.numero}</td>
                                        <td className="px-6 py-4 whitespace-normal">
                                            { os.cliente_nome && (
                                                <span className="text-sm font-semibold text-gray-800 mb-1 break-words">
                                                {os.cliente_nome}
                                                </span>
                                            )}
                                            <p className="text-sm text-gray-500 break-words">
                                                {os.descricao || '-'}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig[os.status].color}`}>
                                            {statusConfig[os.status].label}
                                        </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{os.data_inicio ? new Date(os.data_inicio).toLocaleDateString('pt-BR') : '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(os.total_geral)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end gap-4">
                                            <button onClick={() => onEdit(os)} className="text-indigo-600 hover:text-indigo-900"><Edit size={18} /></button>
                                            <button onClick={() => onDelete(os)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
                                        </div>
                                        </td>
                                    </motion.tr>
                                )}
                            </Draggable>
                        ))}
                    </AnimatePresence>
                    {provided.placeholder}
                </tbody>
            )}
        </Droppable>
      </table>
    </div>
  );
};

export default OsTable;
