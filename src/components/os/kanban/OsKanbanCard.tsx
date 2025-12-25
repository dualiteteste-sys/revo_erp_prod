import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { KanbanOs, type status_os } from '@/services/os';
import { User, MoreHorizontal, ArrowUpRight, CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface OsKanbanCardProps {
  item: KanbanOs;
  index: number;
  onOpenOs?: (osId: string) => void;
  onSetStatus?: (osId: string, next: status_os) => void | Promise<void>;
}

const STATUS_BADGE: Record<status_os, string> = {
  orcamento: 'bg-gray-100 text-gray-800',
  aberta: 'bg-blue-100 text-blue-800',
  concluida: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
};

const STATUS_LABEL: Record<status_os, string> = {
  orcamento: 'Orçamento',
  aberta: 'Aberta',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const OsKanbanCard: React.FC<OsKanbanCardProps> = ({ item, index, onOpenOs, onSetStatus }) => {
  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`p-3 mb-2 bg-white rounded-lg shadow-sm border border-gray-200 ${snapshot.isDragging ? 'shadow-lg' : ''}`}
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="text-left flex-1"
              onClick={() => onOpenOs?.(item.id)}
              title="Abrir O.S."
            >
              <p className="font-semibold text-sm text-gray-800">
                {String(item.numero)} - {item.descricao}
              </p>
              <div className="mt-1">
                <span className={`px-2 py-0.5 inline-flex text-[11px] font-semibold rounded-full ${STATUS_BADGE[item.status]}`}>
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => onOpenOs?.(item.id)}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Abrir O.S.
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSetStatus?.(item.id, 'orcamento')}>
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Marcar como Orçamento
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetStatus?.(item.id, 'aberta')}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Marcar como Aberta
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetStatus?.(item.id, 'concluida')}>
                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                  Concluir O.S.
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetStatus?.(item.id, 'cancelada')}>
                  <XCircle className="mr-2 h-4 w-4 text-rose-600" />
                  Cancelar O.S.
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {item.cliente_nome && (
            <div className="flex items-center gap-1 mt-2 text-xs text-gray-600">
                <User size={12} />
                <span>{item.cliente_nome}</span>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
};

export default OsKanbanCard;
