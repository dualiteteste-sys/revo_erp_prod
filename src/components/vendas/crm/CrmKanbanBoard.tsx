import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DragDropContext, DropResult, Droppable } from '@hello-pangea/dnd';
import { CrmKanbanData, CrmOportunidade, getCrmKanbanData, moveOportunidade, ensureDefaultPipeline } from '@/services/crm';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2, Plus } from 'lucide-react';
import CrmCard from './CrmCard';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthProvider';

interface Props {
  onEditDeal: (deal: CrmOportunidade) => void;
  onNewDeal: (etapaId: string) => void;
  refreshTrigger: number;
}

const CrmKanbanBoard: React.FC<Props> = ({ onEditDeal, onNewDeal, refreshTrigger }) => {
  const [data, setData] = useState<CrmKanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const loadTokenRef = useRef(0);
  const actionTokenRef = useRef(0);
  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);
  const effectiveData = empresaChanged ? null : data;

  const fetchData = useCallback(async () => {
    const token = ++loadTokenRef.current;
    const empresaSnapshot = activeEmpresaId;

    if (authLoading) return;
    if (!empresaSnapshot) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let kanban = await getCrmKanbanData();
      if (token !== loadTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      if (!kanban || !kanban.funil_id) {
        await ensureDefaultPipeline();
        if (token !== loadTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
        kanban = await getCrmKanbanData();
      }
      if (token !== loadTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setData(kanban);
    } catch (error: any) {
      if (token !== loadTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Erro ao carregar o funil.', 'error');
    } finally {
      if (token !== loadTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setLoading(false);
    }
  }, [activeEmpresaId, addToast, authLoading]);

  useEffect(() => {
    loadTokenRef.current += 1;
    actionTokenRef.current += 1;
    lastEmpresaIdRef.current = activeEmpresaId;
    setData(null);

    if (!activeEmpresaId) {
      setLoading(false);
      return;
    }
    setLoading(true);
  }, [activeEmpresaId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refreshTrigger]);

  const onDragEnd = async (result: DropResult) => {
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;

    if (authLoading || !activeEmpresaId || empresaChanged) return;
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (!data) return;

    // Optimistic Update
    const startColIndex = data.etapas.findIndex(e => e.id === source.droppableId);
    const endColIndex = data.etapas.findIndex(e => e.id === destination.droppableId);
    
    const startCol = data.etapas[startColIndex];
    const endCol = data.etapas[endColIndex];
    
    const item = startCol.oportunidades.find(i => i.id === draggableId);
    if (!item) return;

    const newStartItems = Array.from(startCol.oportunidades);
    newStartItems.splice(source.index, 1);
    
    const newEndItems = Array.from(endCol.oportunidades);
    newEndItems.splice(destination.index, 0, { ...item, etapa_id: endCol.id });

    const newEtapas = [...data.etapas];
    newEtapas[startColIndex] = { ...startCol, oportunidades: newStartItems };
    newEtapas[endColIndex] = { ...endCol, oportunidades: newEndItems };

    setData({ ...data, etapas: newEtapas });

    try {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      await moveOportunidade(draggableId, destination.droppableId);
    } catch (error: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Falha ao mover oportunidade.', 'error');
      void fetchData(); // Revert
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!activeEmpresaId) return <div className="p-8 text-center text-gray-500">Selecione uma empresa para acessar o CRM.</div>;

  if (effectiveLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!effectiveData || !effectiveData.etapas) return <div className="p-8 text-center text-gray-500">Nenhum funil encontrado.</div>;

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 h-full overflow-x-auto p-1 pb-4">
        {effectiveData.etapas.map(col => {
            const totalValue = col.oportunidades.reduce((acc, op) => acc + op.valor, 0);
            
            return (
                <div key={col.id} className="flex flex-col w-80 bg-gray-100/80 rounded-xl flex-shrink-0 h-full border border-gray-200/50">
                    <div className={`p-3 border-b border-gray-200 rounded-t-xl border-t-4 ${col.cor ? `border-t-${col.cor.replace('bg-', '').replace('100', '500')}` : 'border-t-gray-400'}`}>
                        <div className="flex justify-between items-center mb-1">
                            <h3 className="font-bold text-gray-700 text-sm">{col.nome}</h3>
                            <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-gray-500 shadow-sm">
                                {col.oportunidades.length}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-500">
                            <span>{formatCurrency(totalValue * 100)}</span>
                            <span>{col.probabilidade}% prob.</span>
                        </div>
                    </div>
                    
                    <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-1 p-2 overflow-y-auto scrollbar-styled transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50/50' : ''}`}
                        >
                            {col.oportunidades.map((item, index) => (
                                <CrmCard key={item.id} item={item} index={index} onClick={() => onEditDeal(item)} />
                            ))}
                            {provided.placeholder}
                            
                            <button 
                                onClick={() => onNewDeal(col.id)}
                                className="w-full py-2 mt-2 flex items-center justify-center gap-1 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors text-sm border border-dashed border-gray-300 hover:border-gray-400"
                            >
                                <Plus size={16} /> Nova Oportunidade
                            </button>
                        </div>
                        )}
                    </Droppable>
                </div>
            );
        })}
      </div>
    </DragDropContext>
  );
};

export default CrmKanbanBoard;
