import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import OsKanbanCard from './OsKanbanCard';
import { KanbanColumn } from './OsKanbanBoard';

interface OsKanbanColumnProps {
  column: KanbanColumn;
}

const OsKanbanColumn: React.FC<OsKanbanColumnProps> = ({ column }) => {
  return (
    <div className="flex flex-col w-80 bg-gray-100/80 rounded-2xl flex-shrink-0 h-full">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-700">{column.title} <span className="text-sm text-gray-500 font-normal">({column.items.length})</span></h3>
      </div>
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-2 overflow-y-auto scrollbar-styled transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
          >
            {column.items.map((item, index) => (
              <OsKanbanCard key={item.id} item={item} index={index} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default OsKanbanColumn;
