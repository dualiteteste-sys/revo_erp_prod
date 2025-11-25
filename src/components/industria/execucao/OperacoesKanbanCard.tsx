import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Operacao } from '@/services/industriaExecucao';
import { User, Calendar, Package, AlertTriangle } from 'lucide-react';
import { formatOrderNumber } from '@/lib/utils';

interface Props {
  item: Operacao;
  index: number;
}

const OperacoesKanbanCard: React.FC<Props> = ({ item, index }) => {
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
            <span className="text-xs font-bold text-blue-600">{formatOrderNumber(item.ordem_numero)}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${item.tipo_ordem === 'producao' ? 'bg-gray-100 text-gray-600' : 'bg-purple-50 text-purple-600'}`}>
                {item.tipo_ordem === 'producao' ? 'IND' : 'BEN'}
            </span>
          </div>
          
          <div className="mb-2">
            <p className="font-semibold text-sm text-gray-800 line-clamp-2" title={item.produto_nome}>{item.produto_nome}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.centro_trabalho_nome}</p>
          </div>

          {item.cliente_nome && (
            <div className="flex items-center gap-1 mb-2 text-xs text-gray-600 truncate">
                <User size={12} className="flex-shrink-0" />
                <span className="truncate">{item.cliente_nome}</span>
            </div>
          )}

          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
             <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, item.percentual_concluido)}%` }}></div>
          </div>

          <div className="flex justify-between items-center border-t border-gray-100 pt-2 mt-2">
             {item.data_prevista_inicio && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Calendar size={12} />
                    <span>{new Date(item.data_prevista_inicio).toLocaleDateString('pt-BR')}</span>
                </div>
             )}
             {item.atrasada && (
                 <div className="flex items-center gap-1 text-xs text-red-600 font-bold">
                     <AlertTriangle size={12} /> Atrasada
                 </div>
             )}
          </div>
        </div>
      )}
    </Draggable>
  );
};

export default OperacoesKanbanCard;
