import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { KanbanOs } from '@/services/os';
import { User } from 'lucide-react';

interface OsKanbanCardProps {
  item: KanbanOs;
  index: number;
}

const OsKanbanCard: React.FC<OsKanbanCardProps> = ({ item, index }) => {
  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`p-3 mb-2 bg-white rounded-lg shadow-sm border border-gray-200 ${snapshot.isDragging ? 'shadow-lg' : ''}`}
        >
          <p className="font-semibold text-sm text-gray-800">{String(item.numero)} - {item.descricao}</p>
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
