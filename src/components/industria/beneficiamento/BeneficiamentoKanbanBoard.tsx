import React, { useState, useEffect } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { listOrdensBeneficiamento, updateStatusBeneficiamento, OrdemBeneficiamento, StatusBeneficiamento } from '@/services/industriaBeneficiamento';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import IndustriaKanbanColumn from '../kanban/IndustriaKanbanColumn';

const COLUMNS: { id: StatusBeneficiamento; title: string }[] = [
  { id: 'aguardando_material', title: 'Aguardando Material' },
  { id: 'em_beneficiamento', title: 'Em Beneficiamento' },
  { id: 'em_inspecao', title: 'Em Inspeção' },
  { id: 'parcialmente_entregue', title: 'Parcialmente Entregue' },
  { id: 'concluida', title: 'Concluída' },
];

const BeneficiamentoKanbanBoard: React.FC = () => {
  const [items, setItems] = useState<OrdemBeneficiamento[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await listOrdensBeneficiamento(undefined, undefined); 
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

    const newStatus = destination.droppableId as StatusBeneficiamento;
    const item = items.find(i => i.id === draggableId);
    if (!item) return;

    // Optimistic Update
    const updatedItems = items.map(i => 
        i.id === draggableId ? { ...i, status: newStatus } : i
    );
    setItems(updatedItems);

    try {
      await updateStatusBeneficiamento(draggableId, newStatus, destination.index);
      addToast(`OB movida para ${newStatus.replace(/_/g, ' ')}`, 'success');
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
    // Cast to any to reuse the generic card component
    return items.filter(i => i.status === status).sort((a, b) => a.prioridade - b.prioridade) as any[];
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

export default BeneficiamentoKanbanBoard;
