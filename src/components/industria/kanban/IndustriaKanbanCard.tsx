import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { OrdemIndustria } from '@/services/industria';
import { User, Calendar, Package, Pencil } from 'lucide-react';
import { formatOrderNumber } from '@/lib/utils';

interface Props {
  item: OrdemIndustria;
  index: number;
  onOpenOrder?: (order: OrdemIndustria) => void;
}

const IndustriaKanbanCard: React.FC<Props> = ({ item, index, onOpenOrder }) => {
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
