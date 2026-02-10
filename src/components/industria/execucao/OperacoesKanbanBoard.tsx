import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { listOperacoes, updateOperacaoStatus, Operacao, StatusOperacao } from '@/services/industriaExecucao';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import OperacoesKanbanColumn from './OperacoesKanbanColumn';
import { useAuth } from '@/contexts/AuthProvider';

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
  const [syncing, setSyncing] = useState(false);
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const actionTokenRef = useRef(0);

  const fetchData = async () => {
    if (authLoading || !activeEmpresaId) return;
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setLoading(true);
    try {
      const data = await listOperacoes('kanban', centroId, status || undefined, search);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setItems(data);
    } catch (error: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Erro ao carregar o quadro.', 'error');
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;
    actionTokenRef.current += 1;
    setSyncing(false);
    setLoading(false);
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  useEffect(() => {
    fetchData();
  }, [centroId, status, search, authLoading, activeEmpresaId]);

  const onDragEnd = async (result: DropResult) => {
    if (syncing || authLoading || !activeEmpresaId) return;
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

    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setSyncing(true);
    try {
      await updateOperacaoStatus(draggableId, newStatus, destination.index, item.centro_trabalho_id);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(`Operação movida para ${newStatus.replace(/_/g, ' ')}`, 'success');
    } catch (error: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Falha ao atualizar status.', 'error');
      fetchData(); // Revert
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setSyncing(false);
    }
  };

  if (loading || authLoading || !activeEmpresaId) {
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
