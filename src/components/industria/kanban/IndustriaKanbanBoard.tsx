import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { listOrdens, updateOrdemStatus, OrdemIndustria, StatusOrdem, TipoOrdemIndustria } from '@/services/industria';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import IndustriaKanbanColumn from './IndustriaKanbanColumn';
import { useAuth } from '@/contexts/AuthProvider';

const COLUMNS_BY_TIPO: Record<TipoOrdemIndustria, { id: StatusOrdem; title: string }[]> = {
  beneficiamento: [
    { id: 'rascunho', title: 'Rascunho' },
    { id: 'planejada', title: 'Planejada' },
    { id: 'aguardando_material', title: 'Aguardando Material' },
    { id: 'em_programacao', title: 'Em Programação' },
    { id: 'em_beneficiamento', title: 'Em Beneficiamento' },
    { id: 'parcialmente_entregue', title: 'Parcialmente Entregue' },
    { id: 'concluida', title: 'Concluída' },
    { id: 'cancelada', title: 'Cancelada' },
  ],
  industrializacao: [
    { id: 'planejada', title: 'Planejada' },
    { id: 'em_programacao', title: 'Em Programação' },
    { id: 'em_producao', title: 'Em Produção' },
    { id: 'em_inspecao', title: 'Em Inspeção' },
    { id: 'parcialmente_concluida', title: 'Parcialmente Concluída' },
    { id: 'concluida', title: 'Concluída' },
    { id: 'cancelada', title: 'Cancelada' },
  ],
};

type Props = {
  tipoOrdem?: TipoOrdemIndustria;
  search?: string;
  refreshToken?: number;
  onOpenOrder?: (order: OrdemIndustria) => void;
  onCloneOrder?: (order: OrdemIndustria) => void;
};

const IndustriaKanbanBoard: React.FC<Props> = ({ tipoOrdem, search, refreshToken, onOpenOrder, onCloneOrder }) => {
  const [items, setItems] = useState<OrdemIndustria[]>([]);
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
      const data = await listOrdens(search, tipoOrdem, undefined);
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
  }, [tipoOrdem, search, refreshToken, authLoading, activeEmpresaId]);

  const onDragEnd = async (result: DropResult) => {
    if (syncing || authLoading || !activeEmpresaId) return;
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId as StatusOrdem;
    const item = items.find(i => i.id === draggableId);
    if (!item) return;
    if (item.status === 'concluida' || item.status === 'cancelada') {
      addToast('Ordens concluídas/canceladas não podem ser movidas.', 'warning');
      return;
    }
    if (newStatus === 'concluida' || newStatus === 'cancelada') {
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
      // We use index as priority for simplicity here, but in a real app we might calculate it better
      await updateOrdemStatus(draggableId, newStatus, destination.index);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(`Ordem movida para ${newStatus.replace(/_/g, ' ')}`, 'success');
    } catch (error: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Falha ao atualizar status.', 'error');
      fetchData(); // Revert
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setSyncing(false);
    }
  };

  const updateItem = (id: string, patch: Partial<OrdemIndustria>) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
  };

  const handleQuickStatus = async (order: OrdemIndustria, newStatus: StatusOrdem) => {
    if (syncing || authLoading || !activeEmpresaId) return;
    if (order.status === newStatus) return;
    if (order.status === 'concluida' || order.status === 'cancelada') return;
    if (newStatus === 'concluida' || newStatus === 'cancelada') {
      addToast('Para concluir/cancelar, use a tela da ordem (wizard).', 'warning');
      return;
    }
    updateItem(order.id, { status: newStatus });
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setSyncing(true);
    try {
      await updateOrdemStatus(order.id, newStatus, order.prioridade);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(`Status atualizado para ${newStatus.replace(/_/g, ' ')}`, 'success');
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Falha ao atualizar status.', 'error');
      fetchData();
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setSyncing(false);
    }
  };

  const handleQuickPriority = async (order: OrdemIndustria, delta: number) => {
    if (syncing || authLoading || !activeEmpresaId) return;
    const next = Math.max(0, (order.prioridade ?? 0) + delta);
    if (next === order.prioridade) return;
    updateItem(order.id, { prioridade: next });
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setSyncing(true);
    try {
      await updateOrdemStatus(order.id, order.status, next);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Prioridade atualizada.', 'success');
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Falha ao atualizar prioridade.', 'error');
      fetchData();
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
  const columns = COLUMNS_BY_TIPO[(tipoOrdem || 'beneficiamento') as TipoOrdemIndustria] || COLUMNS_BY_TIPO.beneficiamento;

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 h-full overflow-x-auto p-1 pb-4">
        {columns.map(col => (
          <IndustriaKanbanColumn 
            key={col.id} 
            columnId={col.id} 
            title={col.title} 
            items={getItemsForColumn(col.id)} 
            onOpenOrder={onOpenOrder}
            onQuickStatus={handleQuickStatus}
            onQuickPriority={handleQuickPriority}
            onCloneOrder={onCloneOrder}
            isDropDisabled={col.id === 'concluida' || col.id === 'cancelada'}
          />
        ))}
      </div>
    </DragDropContext>
  );
};

export default IndustriaKanbanBoard;
