import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { listKanbanOs, updateOsDataPrevista, KanbanOs } from '@/services/os';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import OsKanbanColumn from './OsKanbanColumn';
import { groupOsByDate, getNewDateForColumn, ColumnId } from './helpers';

export type KanbanColumn = {
  id: ColumnId;
  title: string;
  items: KanbanOs[];
};

export type KanbanColumns = Record<ColumnId, KanbanColumn>;

const OsKanbanBoard: React.FC = () => {
  const [columns, setColumns] = useState<KanbanColumns | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listKanbanOs();
      const groupedData = groupOsByDate(data);
      setColumns(groupedData);
    } catch (error: any) {
      addToast(error.message || 'Erro ao carregar a agenda.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const startCol = columns?.[source.droppableId as ColumnId];
    const endCol = columns?.[destination.droppableId as ColumnId];
    const item = startCol?.items.find(i => i.id === draggableId);

    if (!startCol || !endCol || !item) return;

    // Optimistic UI Update
    const newStartItems = Array.from(startCol.items);
    newStartItems.splice(source.index, 1);
    
    const newEndItems = Array.from(endCol.items);
    newEndItems.splice(destination.index, 0, item);

    setColumns(prev => ({
      ...prev!,
      [startCol.id]: { ...startCol, items: newStartItems },
      [endCol.id]: { ...endCol, items: newEndItems },
    }));

    // API Call
    try {
      const newDate = getNewDateForColumn(destination.droppableId as ColumnId);
      await updateOsDataPrevista(item.id, newDate);
      addToast(`Ordem de Serviço ${String(item.numero)} reagendada com sucesso.`, 'success');
    } catch (error: any) {
      addToast(error.message || 'Falha ao reagendar O.S.', 'error');
      // Revert UI on error
      setColumns(prev => ({
        ...prev!,
        [startCol.id]: startCol,
        [endCol.id]: endCol,
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 h-full overflow-x-auto p-1">
        {columns && Object.values(columns).map(col => (
          <OsKanbanColumn key={col.id} column={col} />
        ))}
      </div>
    </DragDropContext>
  );
};

export default OsKanbanBoard;
