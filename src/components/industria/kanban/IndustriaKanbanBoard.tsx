import React, { useState, useEffect } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { listOrdens, updateOrdemStatus, OrdemIndustria, StatusOrdem, replanejarOperacao } from '@/services/industria';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import IndustriaKanbanColumn from './IndustriaKanbanColumn';

const COLUMNS: { id: StatusOrdem; title: string }[] = [
  { id: 'planejada', title: 'Planejada' },
  { id: 'em_programacao', title: 'Em Programação' },
  { id: 'em_producao', title: 'Em Produção' },
  { id: 'em_inspecao', title: 'Em Inspeção' },
  { id: 'parcialmente_concluida', title: 'Parcialmente Concluída' },
  { id: 'concluida', title: 'Concluída' },
];

const IndustriaKanbanBoard: React.FC = () => {
  const [items, setItems] = useState<OrdemIndustria[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await listOrdens(undefined, undefined, undefined, 1, 100); // Fetch more items for kanban
      setItems(data);
    } catch (error: any) {
      addToast('Erro ao carregar o quadro.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId as StatusOrdem;
    const item = items.find(i => i.id === draggableId);
    if (!item) return;

    // Optimistic Update
    const updatedItems = items.map(i => 
        i.id === draggableId ? { ...i, status: newStatus } : i
    );
    setItems(updatedItems);

    try {
      // We use index as priority for simplicity here, but in a real app we might calculate it better
      await updateOrdemStatus(draggableId, newStatus, destination.index);
      addToast(`Ordem movida para ${newStatus.replace(/_/g, ' ')}`, 'success');
    } catch (error: any) {
      addToast('Falha ao atualizar status.', 'error');
      fetchData(); // Revert
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  const getItemsForColumn = (status: string) => {
    return items.filter(i => i.status === status).sort((a, b) => a.prioridade - b.prioridade);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 h-full overflow-x-auto p-1 pb-4">
        {COLUMNS.map(col => (
          <IndustriaKanbanColumn 
            key={col.id} 
            columnId={col.id} 
            title={col.title} 
            items={getItemsForColumn(col.id)} 
          />
        ))}
      </div>
    </DragDropContext>
  );
};

export default IndustriaKanbanBoard;
