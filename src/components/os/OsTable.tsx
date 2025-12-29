import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrdemServico } from '@/services/os';
import { Edit, Trash2, ArrowUpDown, GripVertical, MoreHorizontal, CalendarClock, Paperclip, CheckCircle2, XCircle, ClipboardCheck, ArrowUpRight } from 'lucide-react';
import { Database } from '@/types/database.types';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface OsTableProps {
  serviceOrders: OrdemServico[];
  onEdit: (os: OrdemServico) => void;
  onDelete: (os: OrdemServico) => void;
  onOpenAgenda: () => void;
  onSetStatus: (os: OrdemServico, next: Database['public']['Enums']['status_os']) => void;
  sortBy: { column: keyof OrdemServico; ascending: boolean };
  onSort: (column: keyof OrdemServico) => void;
  canUpdate?: boolean;
  canDelete?: boolean;
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

const OsTable: React.FC<OsTableProps> = ({ serviceOrders, onEdit, onDelete, onOpenAgenda, onSetStatus, sortBy, onSort, canUpdate = true, canDelete = true }) => {
  const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('pt-BR') : '—');
  const formatTime = (value?: string | null) => (value ? String(value).slice(0, 5) : '');

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="ordem" label="" sortBy={sortBy} onSort={onSort} className="w-12" />
            <SortableHeader column="numero" label="Nº" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="cliente_nome" label="Cliente / Descrição" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="status" label="Status" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="data_prevista" label="Agendamento" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="total_geral" label="Total" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <Droppable droppableId="os-table-droppable">
            {(provided) => (
                <tbody ref={provided.innerRef} {...provided.droppableProps} className="bg-white divide-y divide-gray-200">
                    <AnimatePresence>
                        {serviceOrders.map((os, index) => (
                            <Draggable key={os.id} draggableId={os.id} index={index} isDragDisabled={!canUpdate}>
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
                                        <td
                                          className={`px-2 py-4 whitespace-nowrap text-sm text-gray-400 ${canUpdate ? 'cursor-grab' : 'cursor-default opacity-50'}`}
                                          {...(canUpdate ? provided.dragHandleProps : {})}
                                        >
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
                                            {Array.isArray((os as any).anexos) && (os as any).anexos.length ? (
                                              <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                                                <Paperclip size={14} />
                                                <span>{(os as any).anexos.length} anexo(s)</span>
                                              </div>
                                            ) : null}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig[os.status].color}`}>
                                            {statusConfig[os.status].label}
                                        </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                          <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-md bg-blue-50 text-blue-700">
                                              <CalendarClock size={16} />
                                            </div>
                                            <div className="leading-tight">
                                              <div className="font-medium text-gray-800">{formatDate((os as any).data_prevista || (os as any).data_inicio)}</div>
                                              <div className="text-xs text-gray-500">{formatTime((os as any).hora) || '—'}</div>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(os.total_geral)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end gap-4">
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <button className="text-slate-600 hover:text-slate-800" title="Mais ações">
                                                  <MoreHorizontal size={18} />
                                                </button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end" sideOffset={6} className="w-56">
                                                <DropdownMenuItem onClick={() => onEdit(os)} className="gap-2">
                                                  <ArrowUpRight size={16} />
                                                  Abrir
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onOpenAgenda()} className="gap-2">
                                                  <CalendarClock size={16} />
                                                  Abrir Agenda
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => onSetStatus(os, 'orcamento')} className="gap-2" disabled={!canUpdate}>
                                                  <ClipboardCheck size={16} />
                                                  Marcar como Orçamento
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onSetStatus(os, 'aberta')} className="gap-2" disabled={!canUpdate}>
                                                  <ClipboardCheck size={16} />
                                                  Marcar como Aberta
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onSetStatus(os, 'concluida')} className="gap-2" disabled={!canUpdate}>
                                                  <CheckCircle2 size={16} />
                                                  Concluir
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onSetStatus(os, 'cancelada')} className="gap-2" disabled={!canUpdate}>
                                                  <XCircle size={16} />
                                                  Cancelar
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>

                                            <button onClick={() => onEdit(os)} className="text-indigo-600 hover:text-indigo-900" title="Editar"><Edit size={18} /></button>
                                            {canDelete ? (
                                              <button onClick={() => onDelete(os)} className="text-red-600 hover:text-red-900" title="Excluir"><Trash2 size={18} /></button>
                                            ) : null}
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
