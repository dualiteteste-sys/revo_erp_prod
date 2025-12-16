import React, { useState, useEffect } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { listOperacoes, updateOperacaoStatus, Operacao, StatusOperacao } from '@/services/industriaExecucao';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import OperacoesKanbanColumn from './OperacoesKanbanColumn';

const COLUMNS: { id: StatusOperacao; title: string }[] = [
  { id: 'planejada', title: 'Planejada' },
  { id: 'liberada', title: 'Liberada' },
  { id: 'em_execucao', title: 'Em Execução' },
  { id: 'em_espera', title: 'Em Espera' },
  { id: 'em_inspecao', title: 'Em Inspeção' },
  { id: 'concluida', title: 'Concluída' },
];

interface Props {
    centroId?: string;
    status?: string;
    search?: string;
}

const OperacoesKanbanBoard: React.FC<Props> = ({ centroId, status, search }) => {
  const [items, setItems] = useState<Operacao[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await listOperacoes('kanban', centroId, status || undefined, search);
      setItems(data);
    } catch (error: any) {
      addToast('Erro ao carregar o quadro.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [centroId, status, search]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId as StatusOperacao;
    const item = items.find(i => i.id === draggableId);
    if (!item) return;

    // Optimistic Update
    const updatedItems = items.map(i => 
        i.id === draggableId ? { ...i, status: newStatus } : i
    );
    setItems(updatedItems);

    try {
      await updateOperacaoStatus(draggableId, newStatus, destination.index, item.centro_trabalho_id);
      addToast(`Operação movida para ${newStatus.replace(/_/g, ' ')}`, 'success');
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
          <OperacoesKanbanColumn 
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

export default OperacoesKanbanBoard;
