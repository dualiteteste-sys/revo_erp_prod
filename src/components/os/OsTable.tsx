import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrdemServico } from '@/services/os';
import { Edit, Trash2, GripVertical, MoreHorizontal, CalendarClock, Paperclip, CheckCircle2, XCircle, ClipboardCheck, ArrowUpRight, UserRound } from 'lucide-react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

interface OsTableProps {
  serviceOrders: OrdemServico[];
  onEdit: (os: OrdemServico) => void;
  onDelete: (os: OrdemServico) => void;
  onOpenAgenda: () => void;
  onSetStatus: (os: OrdemServico, next: OsStatus) => void;
  sortBy: { column: keyof OrdemServico; ascending: boolean };
  onSort: (column: keyof OrdemServico) => void;
  canUpdate?: boolean;
  canManage?: boolean;
  canDelete?: boolean;
  busyOsId?: string | null;
}

type OsStatus = 'orcamento' | 'aberta' | 'concluida' | 'cancelada';
const statusConfig: Record<OsStatus, { label: string; color: string }> = {
  orcamento: { label: 'Orçamento', color: 'bg-gray-100 text-gray-800' },
  aberta: { label: 'Aberta', color: 'bg-blue-100 text-blue-800' },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

const OsTable: React.FC<OsTableProps> = ({ serviceOrders, onEdit, onDelete, onOpenAgenda, onSetStatus, sortBy, onSort, canUpdate = true, canManage = false, canDelete = true, busyOsId }) => {
  const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('pt-BR') : '—');
  const formatTime = (value?: string | null) => (value ? String(value).slice(0, 5) : '');
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const sort: SortState<string> = sortBy ? { column: sortBy.column, direction: sortBy.ascending ? 'asc' : 'desc' } : null;

  const columns: TableColumnWidthDef[] = [
    { id: 'ordem', defaultWidth: 70, minWidth: 60 },
    { id: 'numero', defaultWidth: 110, minWidth: 90 },
    { id: 'cliente_nome', defaultWidth: 360, minWidth: 240 },
    { id: 'status', defaultWidth: 160, minWidth: 140 },
    { id: 'data_prevista', defaultWidth: 190, minWidth: 170 },
    { id: 'total_geral', defaultWidth: 150, minWidth: 140 },
    { id: 'acoes', defaultWidth: 200, minWidth: 170 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'os:list', columns });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div>
      {isMobile ? (
      <div className="space-y-3 p-3">
        {serviceOrders.map((os) => {
          const busy = !!busyOsId && busyOsId === os.id;
          const tecnicoNome = (os as any).tecnico_nome || (os as any).tecnico || null;
          return (
            <div key={os.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">O.S. #{os.numero}</div>
                  <div className="font-semibold text-gray-900">{os.cliente_nome || 'Sem cliente'}</div>
                </div>
	                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusConfig[os.status as OsStatus].color}`}>{statusConfig[os.status as OsStatus].label}</span>
	              </div>

              <div className="mt-2 text-sm text-gray-600">{os.descricao || '—'}</div>
              {tecnicoNome ? (
                <div className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600">
                  <UserRound size={14} />
                  <span>Técnico: {tecnicoNome}</span>
                </div>
              ) : null}
              {Array.isArray((os as any).anexos) && (os as any).anexos.length ? (
                <div className="mt-2 inline-flex items-center gap-2 text-xs text-gray-500">
                  <Paperclip size={14} />
                  <span>{(os as any).anexos.length} anexo(s)</span>
                </div>
              ) : null}

              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  <div>Prevista: {formatDate((os as any).data_prevista || (os as any).data_inicio)}</div>
                  <div>{formatTime((os as any).hora) || '—'}</div>
                </div>

                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="text-slate-600 hover:text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Mais ações"
                        disabled={busy}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6} className="w-56">
                      <DropdownMenuItem onClick={() => onEdit(os)} className="gap-2" disabled={busy}>
                        <ArrowUpRight size={16} />
                        Abrir
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onOpenAgenda()} className="gap-2" disabled={busy}>
                        <CalendarClock size={16} />
                        Abrir Agenda
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onSetStatus(os, 'orcamento')} className="gap-2" disabled={!canUpdate || busy}>
                        <ClipboardCheck size={16} />
                        Marcar como Orçamento
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onSetStatus(os, 'aberta')} className="gap-2" disabled={!canUpdate || busy}>
                        <ClipboardCheck size={16} />
                        Marcar como Aberta
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onSetStatus(os, 'concluida')} className="gap-2" disabled={!canManage || busy}>
                        <CheckCircle2 size={16} />
                        Concluir
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onSetStatus(os, 'cancelada')} className="gap-2" disabled={!canManage || busy}>
                        <XCircle size={16} />
                        Cancelar
                      </DropdownMenuItem>
                      {canDelete ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onDelete(os)} className="gap-2 text-red-600" disabled={busy}>
                            <Trash2 size={16} />
                            Excluir
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    onClick={() => onEdit(os)}
                    disabled={busy}
                    className="text-indigo-600 hover:text-indigo-900 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium"
                    title="Abrir"
                  >
                    Abrir
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      ) : null}

      <div className={isMobile ? 'hidden' : 'overflow-x-auto'}>
        <table className="min-w-[1240px] w-full divide-y divide-gray-200 table-fixed">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh
              columnId="ordem"
              label={<span className="sr-only">Ordem</span>}
              sort={sort}
              onSort={onSort as any}
              onResizeStart={startResize}
              align="center"
              className="px-2"
              renderSortIndicator={({ isSorted }) =>
                isSorted && sort?.column === 'ordem' ? (
                  <span className="text-blue-600 font-bold text-[11px]">(Manual)</span>
                ) : null
              }
            />
            <ResizableSortableTh columnId="numero" label="Nº" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="cliente_nome" label="Cliente / Descrição" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="status" label="Status" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="data_prevista" label="Agendamento" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="total_geral" label="Total" sort={sort} onSort={onSort as any} onResizeStart={startResize} align="right" />
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
        <Droppable droppableId="os-table-droppable">
            {(provided) => (
                <tbody ref={provided.innerRef} {...provided.droppableProps} className="bg-white divide-y divide-gray-200">
                    <AnimatePresence>
                        {serviceOrders.map((os, index) => {
                          const busy = !!busyOsId && busyOsId === os.id;
                          return (
                            <Draggable key={os.id} draggableId={os.id} index={index} isDragDisabled={!canUpdate || busy}>
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
                                          {...(canUpdate && !busy ? provided.dragHandleProps : {})}
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
                                            {((os as any).tecnico_nome || (os as any).tecnico) ? (
                                              <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                                                <UserRound size={14} />
                                                <span>Técnico: {(os as any).tecnico_nome || (os as any).tecnico}</span>
                                              </div>
                                            ) : null}
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
                                                <button
                                                  className="text-slate-600 hover:text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                                  title="Mais ações"
                                                  disabled={busy}
                                                >
                                                  <MoreHorizontal size={18} />
                                                </button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end" sideOffset={6} className="w-56">
                                                <DropdownMenuItem onClick={() => onEdit(os)} className="gap-2" disabled={busy}>
                                                  <ArrowUpRight size={16} />
                                                  Abrir
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onOpenAgenda()} className="gap-2" disabled={busy}>
                                                  <CalendarClock size={16} />
                                                  Abrir Agenda
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => onSetStatus(os, 'orcamento')} className="gap-2" disabled={!canUpdate || busy}>
                                                  <ClipboardCheck size={16} />
                                                  Marcar como Orçamento
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onSetStatus(os, 'aberta')} className="gap-2" disabled={!canUpdate || busy}>
                                                  <ClipboardCheck size={16} />
                                                  Marcar como Aberta
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onSetStatus(os, 'concluida')} className="gap-2" disabled={!canManage || busy}>
                                                  <CheckCircle2 size={16} />
                                                  Concluir
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onSetStatus(os, 'cancelada')} className="gap-2" disabled={!canManage || busy}>
                                                  <XCircle size={16} />
                                                  Cancelar
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>

                                            <button onClick={() => onEdit(os)} disabled={busy} className="text-indigo-600 hover:text-indigo-900 disabled:opacity-60 disabled:cursor-not-allowed" title="Editar"><Edit size={18} /></button>
                                            {canDelete ? (
                                              <button onClick={() => onDelete(os)} disabled={busy} className="text-red-600 hover:text-red-900 disabled:opacity-60 disabled:cursor-not-allowed" title="Excluir"><Trash2 size={18} /></button>
                                            ) : null}
                                        </div>
                                        </td>
                                    </motion.tr>
                                )}
                            </Draggable>
                          );
                        })}
                    </AnimatePresence>
                    {provided.placeholder}
                </tbody>
            )}
        </Droppable>
        </table>
      </div>
    </div>
  );
};

export default OsTable;
