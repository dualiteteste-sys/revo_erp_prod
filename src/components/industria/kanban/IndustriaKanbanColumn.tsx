import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import IndustriaKanbanCard from './IndustriaKanbanCard';
import { OrdemIndustria, StatusOrdem } from '@/services/industria';

interface Props {
  columnId: string;
  title: string;
  items: OrdemIndustria[];
  onOpenOrder?: (order: OrdemIndustria) => void;
  onQuickStatus?: (order: OrdemIndustria, status: StatusOrdem) => void;
  onQuickPriority?: (order: OrdemIndustria, delta: number) => void;
  onCloneOrder?: (order: OrdemIndustria) => void;
}

const IndustriaKanbanColumn: React.FC<Props> = ({ columnId, title, items, onOpenOrder, onQuickStatus, onQuickPriority, onCloneOrder }) => {
  return (
    <div className="flex flex-col w-72 bg-gray-100/80 rounded-xl flex-shrink-0 h-full border border-gray-200/50">
      <div className="p-3 border-b border-gray-200 flex justify-between items-center">
        <h3 className="font-semibold text-gray-700 text-sm">{title}</h3>
        <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-gray-500 shadow-sm">
            {items.length}
        </span>
      </div>
      <Droppable droppableId={columnId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-2 overflow-y-auto scrollbar-styled transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50/50' : ''}`}
          >
            {items.map((item, index) => (
              <IndustriaKanbanCard
                key={item.id}
                item={item}
                index={index}
                onOpenOrder={onOpenOrder}
                onQuickStatus={onQuickStatus}
                onQuickPriority={onQuickPriority}
                onCloneOrder={onCloneOrder}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default IndustriaKanbanColumn;
