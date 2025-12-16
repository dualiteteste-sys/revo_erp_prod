import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { OrdemIndustria, StatusOrdem } from '@/services/industria';
import { User, Calendar, Package, Pencil, MoreVertical, ArrowUp, ArrowDown, CheckCircle2, Copy } from 'lucide-react';
import { formatOrderNumber } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  item: OrdemIndustria;
  index: number;
  onOpenOrder?: (order: OrdemIndustria) => void;
  onQuickStatus?: (order: OrdemIndustria, status: StatusOrdem) => void;
  onQuickPriority?: (order: OrdemIndustria, delta: number) => void;
  onCloneOrder?: (order: OrdemIndustria) => void;
}

const STATUS_OPTIONS: { id: StatusOrdem; label: string }[] = [
  { id: 'planejada', label: 'Planejada' },
  { id: 'em_programacao', label: 'Em Programação' },
  { id: 'em_producao', label: 'Em Produção' },
  { id: 'em_inspecao', label: 'Em Inspeção' },
  { id: 'parcialmente_concluida', label: 'Parcialmente Concluída' },
  { id: 'concluida', label: 'Concluída' },
];

const IndustriaKanbanCard: React.FC<Props> = ({ item, index, onOpenOrder, onQuickStatus, onQuickPriority, onCloneOrder }) => {
  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`p-3 mb-2 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400 rotate-2' : ''}`}
        >
          <div className="flex justify-between items-start mb-1">
            <span className="text-xs font-bold text-blue-600">{formatOrderNumber(item.numero)}</span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${item.tipo_ordem === 'industrializacao' ? 'bg-gray-100 text-gray-600' : 'bg-purple-50 text-purple-600'}`}>
                {item.tipo_ordem === 'industrializacao' ? 'IND' : 'BEN'}
              </span>
              {onOpenOrder && (
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenOrder(item);
                  }}
                  className="p-1 rounded-md text-gray-500 hover:text-blue-700 hover:bg-blue-50"
                  title="Abrir ordem"
                >
                  <Pencil size={14} />
                </button>
              )}
              {(onQuickStatus || onQuickPriority) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                      title="Ações rápidas"
                    >
                      <MoreVertical size={14} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={6}>
                    <DropdownMenuLabel>Ordem</DropdownMenuLabel>
                    {onOpenOrder && (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          onOpenOrder(item);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Abrir
                      </DropdownMenuItem>
                    )}
                    {onCloneOrder && (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          onCloneOrder(item);
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {onQuickPriority && (
                      <>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            onQuickPriority(item, -1);
                          }}
                        >
                          <ArrowUp className="mr-2 h-4 w-4" />
                          Aumentar prioridade
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            onQuickPriority(item, +1);
                          }}
                        >
                          <ArrowDown className="mr-2 h-4 w-4" />
                          Reduzir prioridade
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {onQuickStatus && (
                      <>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Mudar status
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {STATUS_OPTIONS.map((s) => (
                              <DropdownMenuItem
                                key={s.id}
                                onSelect={(e) => {
                                  e.preventDefault();
                                  onQuickStatus(item, s.id);
                                }}
                              >
                                {s.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          
          <div className="mb-2">
            <p className="font-semibold text-sm text-gray-800 line-clamp-2" title={item.produto_nome}>{item.produto_nome}</p>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <Package size={12} />
            <span>{item.quantidade_planejada} {item.unidade}</span>
          </div>

          {item.cliente_nome && (
            <div className="flex items-center gap-1 mb-2 text-xs text-gray-600 truncate">
                <User size={12} className="flex-shrink-0" />
                <span className="truncate">{item.cliente_nome}</span>
            </div>
          )}

          {item.data_prevista_entrega && (
             <div className={`flex items-center gap-1 text-xs mt-2 pt-2 border-t border-gray-100 ${new Date(item.data_prevista_entrega) < new Date() ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                <Calendar size={12} />
                <span>{new Date(item.data_prevista_entrega).toLocaleDateString('pt-BR')}</span>
             </div>
          )}
        </div>
      )}
    </Draggable>
  );
};

export default IndustriaKanbanCard;
