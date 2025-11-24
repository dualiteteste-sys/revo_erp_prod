import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { CrmOportunidade } from '@/services/crm';
import { User, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props {
  item: CrmOportunidade;
  index: number;
  onClick: () => void;
}

const priorityColors = {
  alta: 'border-l-4 border-l-red-500',
  media: 'border-l-4 border-l-yellow-500',
  baixa: 'border-l-4 border-l-blue-500',
};

const CrmCard: React.FC<Props> = ({ item, index, onClick }) => {
  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`p-3 mb-2 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all cursor-pointer ${priorityColors[item.prioridade]} ${snapshot.isDragging ? 'shadow-lg rotate-2 scale-105' : ''}`}
        >
          <h4 className="font-semibold text-gray-800 text-sm mb-1 line-clamp-2">{item.titulo}</h4>
          
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-700 font-bold text-sm flex items-center gap-1">
                <DollarSign size={12} />
                {formatCurrency(item.valor * 100)}
            </span>
            {item.prioridade === 'alta' && <AlertCircle size={12} className="text-red-500" />}
          </div>

          {item.cliente_nome && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1 truncate">
                <User size={12} className="flex-shrink-0" />
                <span className="truncate">{item.cliente_nome}</span>
            </div>
          )}

          {item.data_fechamento && (
             <div className="flex items-center gap-1 text-xs text-gray-400 pt-2 border-t border-gray-100 mt-2">
                <Calendar size={12} />
                <span>{new Date(item.data_fechamento).toLocaleDateString('pt-BR')}</span>
             </div>
          )}
        </div>
      )}
    </Draggable>
  );
};

export default CrmCard;
