import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { listKanbanOsV2, setOsStatus, updateOsDataPrevista, KanbanOs, type status_os } from '@/services/os';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2, RefreshCw, Filter } from 'lucide-react';
import OsKanbanColumn from './OsKanbanColumn';
import { groupOsByDate, getNewDateForColumn, ColumnId } from './helpers';
import SearchField from '@/components/ui/forms/SearchField';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHasPermission } from '@/hooks/useHasPermission';
import { useBillingGate } from '@/hooks/useBillingGate';

export type KanbanColumn = {
  id: ColumnId;
  title: string;
  items: KanbanOs[];
};

export type KanbanColumns = Record<ColumnId, KanbanColumn>;

const DEFAULT_STATUS: status_os[] = ['orcamento', 'aberta'];

const STATUS_LABEL: Record<status_os, string> = {
  orcamento: 'Orçamento',
  aberta: 'Aberta',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const OsKanbanBoard: React.FC<{ onOpenOs?: (osId: string) => void; canUpdate?: boolean; canManage?: boolean }> = ({ onOpenOs, canUpdate, canManage }) => {
  const [columns, setColumns] = useState<KanbanColumns | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const billing = useBillingGate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<status_os[]>(DEFAULT_STATUS);
  const permUpdate = useHasPermission('os', 'update');
  const permManage = useHasPermission('os', 'manage');
  const canEdit = typeof canUpdate === 'boolean' ? canUpdate : permUpdate.data;
  const canClose = typeof canManage === 'boolean' ? canManage : permManage.data;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listKanbanOsV2({ search: search || null, status });
      const groupedData = groupOsByDate(data);
      setColumns(groupedData);
    } catch (error: any) {
      addToast(error.message || 'Erro ao carregar a agenda.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, search, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    if (!canEdit) {
      addToast('Você não tem permissão para reagendar O.S.', 'warning');
      return;
    }

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
      <div className="flex flex-col gap-3 h-full">
        <div className="flex flex-wrap gap-3 items-end justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <SearchField
              placeholder="Buscar por nº, cliente ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter size={16} />
                  Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Mostrar no Kanban</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(['orcamento', 'aberta', 'concluida', 'cancelada'] as status_os[]).map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    checked={status.includes(s)}
                    onCheckedChange={(checked) => {
                      setStatus((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(s);
                        else next.delete(s);
                        const arr = Array.from(next);
                        return arr.length ? arr : DEFAULT_STATUS;
                      });
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button onClick={fetchData} variant="outline" className="gap-2">
            <RefreshCw size={16} />
            Atualizar
          </Button>
        </div>

        <div className="flex gap-4 flex-1 overflow-x-auto p-1">
        {columns && Object.values(columns).map(col => (
          <OsKanbanColumn
            key={col.id}
            column={col}
            onOpenOs={onOpenOs}
            onSetStatus={async (osId, next) => {
              if (!canEdit) {
                addToast('Você não tem permissão para alterar status.', 'warning');
                return;
              }
              if ((next === 'concluida' || next === 'cancelada') && !canClose) {
                addToast('Você não tem permissão para concluir/cancelar O.S.', 'warning');
                return;
              }
              if (!billing.ensureCanWrite({ actionLabel: `Alterar status da O.S. (${STATUS_LABEL[next]})` })) return;
              try {
                await setOsStatus(osId, next);
                addToast(`Status atualizado para "${STATUS_LABEL[next]}".`, 'success');
                await fetchData();
              } catch (e: any) {
                addToast(e?.message || 'Falha ao atualizar status.', 'error');
              }
            }}
            canUpdate={canEdit}
            canManage={canClose}
          />
        ))}
        </div>
      </div>
    </DragDropContext>
  );
};

export default OsKanbanBoard;
