import React, { useState, useEffect } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { listOrdensProducao, updateStatusProducao, OrdemProducao, StatusProducao } from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import IndustriaKanbanColumn from '../kanban/IndustriaKanbanColumn';

const COLUMNS: { id: StatusProducao; title: string }[] = [
  { id: 'planejada', title: 'Planejada' },
  { id: 'em_programacao', title: 'Em Programação' },
  { id: 'em_producao', title: 'Em Produção' },
  { id: 'em_inspecao', title: 'Em Inspeção' },
  { id: 'concluida', title: 'Concluída' },
];

type Props = {
  search?: string;
  statusFilter?: string;
  onOpenOrder?: (order: OrdemProducao) => void;
  onCloneOrder?: (order: OrdemProducao) => void;
};

const ProducaoKanbanBoard: React.FC<Props> = ({ search, statusFilter, onOpenOrder, onCloneOrder }) => {
  const [items, setItems] = useState<OrdemProducao[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await listOrdensProducao(search, statusFilter || undefined);
      setItems(data);
    } catch (error: any) {
      addToast('Erro ao carregar o quadro.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId as StatusProducao;
    const item = items.find(i => i.id === draggableId);
    if (!item) return;

    // Optimistic Update
    const updatedItems = items.map(i => 
        i.id === draggableId ? { ...i, status: newStatus } : i
    );
    setItems(updatedItems);

    try {
      await updateStatusProducao(draggableId, newStatus, destination.index);
      addToast(`OP movida para ${newStatus.replace(/_/g, ' ')}`, 'success');
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
    // Cast to any to reuse the generic card component which expects OrdemIndustria-like shape
    return items
      .filter(i => i.status === status)
      .sort((a, b) => a.prioridade - b.prioridade)
      .map((i) => ({ ...i, tipo_ordem: 'industrializacao' })) as any[];
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
            onOpenOrder={onOpenOrder as any}
            onCloneOrder={onCloneOrder as any}
          />
        ))}
      </div>
    </DragDropContext>
  );
};

export default ProducaoKanbanBoard;
