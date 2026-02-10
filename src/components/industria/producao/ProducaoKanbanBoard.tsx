import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { listOrdensProducao, updateStatusProducao, OrdemProducao, StatusProducao } from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import IndustriaKanbanColumn from '../kanban/IndustriaKanbanColumn';
import { useAuth } from '@/contexts/AuthProvider';

const COLUMNS: { id: StatusProducao; title: string }[] = [
  { id: 'planejada', title: 'Planejada' },
  { id: 'em_programacao', title: 'Em Programação' },
  { id: 'em_producao', title: 'Em Produção' },
  { id: 'em_inspecao', title: 'Em Inspeção' },
  { id: 'concluida', title: 'Concluída' },
  { id: 'cancelada', title: 'Cancelada' },
];

type Props = {
  search?: string;
  statusFilter?: string;
  refreshToken?: number;
  onOpenOrder?: (order: OrdemProducao) => void;
  onCloneOrder?: (order: OrdemProducao) => void;
};

const ProducaoKanbanBoard: React.FC<Props> = ({ search, statusFilter, refreshToken, onOpenOrder, onCloneOrder }) => {
  const [items, setItems] = useState<OrdemProducao[]>([]);
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
      const data = await listOrdensProducao(search, statusFilter || undefined);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, refreshToken, authLoading, activeEmpresaId]);

  const onDragEnd = async (result: DropResult) => {
    if (syncing || authLoading || !activeEmpresaId) return;
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId as StatusProducao;
    const item = items.find(i => i.id === draggableId);
    if (!item) return;
    if ((item.status as any) === 'concluida' || (item.status as any) === 'cancelada') {
      addToast('OPs concluídas/canceladas não podem ser movidas.', 'warning');
      return;
    }
    if ((newStatus as any) === 'concluida' || (newStatus as any) === 'cancelada') {
      addToast('Para concluir/cancelar, use a tela da ordem (wizard).', 'warning');
      return;
    }

    // Optimistic Update
    const updatedItems = items.map(i => 
        i.id === draggableId ? { ...i, status: newStatus } : i
    );
    setItems(updatedItems);

    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setSyncing(true);
    try {
      await updateStatusProducao(draggableId, newStatus, destination.index);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(`OP movida para ${newStatus.replace(/_/g, ' ')}`, 'success');
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
            isDropDisabled={(col.id as any) === 'concluida' || (col.id as any) === 'cancelada'}
          />
        ))}
      </div>
    </DragDropContext>
  );
};

export default ProducaoKanbanBoard;
