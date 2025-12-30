import React, { useState, useEffect } from 'react';
import { listOrdensProducao, OrdemProducao, seedOrdensProducao, deleteOrdemProducao } from '@/services/industriaProducao';
import { PlusCircle, Search, LayoutGrid, List, Hammer, DatabaseBackup } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/forms/Select';
import ProducaoTable from '@/components/industria/producao/ProducaoTable';
import ProducaoFormPanel from '@/components/industria/producao/ProducaoFormPanel';
import ProducaoKanbanBoard from '@/components/industria/producao/ProducaoKanbanBoard';
import { useToast } from '@/contexts/ToastProvider';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { isSeedEnabled } from '@/utils/seed';

export default function ProducaoPage() {
  const enableSeed = isSeedEnabled();
  const [viewMode, setViewMode] = useLocalStorageState<'list' | 'kanban'>('industria:producao:viewMode', 'list');
  const [orders, setOrders] = useState<OrdemProducao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useLocalStorageState<string>('industria:producao:statusFilter', '');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm } = useConfirm();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [kanbanRefresh, setKanbanRefresh] = useState(0);

  // Deep-link: /app/industria/producao?new=1
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setSelectedId(null);
    setIsFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Deep-link/share: persist view/status in URL when present, without forcing it.
  useEffect(() => {
    const urlView = searchParams.get('view');
    const urlStatus = searchParams.get('status');
    const shouldHydrate = urlView || urlStatus;
    if (!shouldHydrate) return;
    if (urlView === 'list' || urlView === 'kanban') setViewMode(urlView);
    if (urlStatus !== null) setStatusFilter(urlStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('view', viewMode);
    if (statusFilter) next.set('status', statusFilter);
    else next.delete('status');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, statusFilter]);

  const fetchOrders = async () => {
    if (viewMode === 'kanban') return;
    setLoading(true);
    try {
      const data = await listOrdensProducao(debouncedSearch, statusFilter || undefined);
      setOrders(data);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar ordens de produção.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [debouncedSearch, statusFilter, viewMode]);

  const handleNew = () => {
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (order: OrdemProducao) => {
    setSelectedId(order.id);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setSelectedId(null);
  };

  const handleSuccess = () => {
    if (viewMode === 'list') fetchOrders();
    if (viewMode === 'kanban') setKanbanRefresh(k => k + 1);
    if (!selectedId) handleClose();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedOrdensProducao();
      addToast('5 Ordens de Produção criadas com sucesso!', 'success');
      if (viewMode === 'list') fetchOrders();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir Ordem de Produção',
      description: 'Tem certeza que deseja excluir esta Ordem de Produção? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteOrdemProducao(id);
      addToast('Ordem excluída com sucesso!', 'success');
      if (viewMode === 'list') fetchOrders();
    } catch (e: any) {
      addToast('Erro ao excluir ordem: ' + e.message, 'error');
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Hammer className="text-blue-600" /> Ordens de Produção
          </h1>
          <p className="text-gray-600 text-sm mt-1">Transformação de insumos em produtos acabados.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-gray-100 p-1 rounded-lg flex">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              title="Lista"
            >
              <List size={20} />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              title="Kanban"
            >
              <LayoutGrid size={20} />
            </button>
          </div>
          {enableSeed ? (
            <Button onClick={handleSeed} disabled={isSeeding || loading} variant="secondary" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
              Popular Dados
            </Button>
          ) : null}
          <Button onClick={handleNew} className="gap-2">
            <PlusCircle size={18} />
            Nova OP
          </Button>
        </div>
      </div>

      <div className="mb-6 flex gap-4 flex-shrink-0 flex-wrap">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por número ou produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-w-[200px]"
        >
          <option value="">Todos os Status</option>
          <option value="planejada">Planejada</option>
          <option value="em_programacao">Em Programação</option>
          <option value="em_producao">Em Produção</option>
          <option value="em_inspecao">Em Inspeção</option>
          <option value="concluida">Concluída</option>
          <option value="cancelada">Cancelada</option>
        </Select>
      </div>

      <div className="flex-grow overflow-hidden">
        {viewMode === 'list' ? (
          <div className="bg-white rounded-lg shadow overflow-hidden h-full overflow-y-auto">
            {loading ? (
              <div className="flex justify-center h-64 items-center">
                <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
              </div>
            ) : (
              <ProducaoTable orders={orders} onEdit={handleEdit} onDelete={handleDelete} />
            )}
          </div>
        ) : (
          <ProducaoKanbanBoard search={debouncedSearch} statusFilter={statusFilter} refreshToken={kanbanRefresh} />
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Ordem de Produção' : 'Nova Ordem de Produção'} size="90pct">
        <ProducaoFormPanel ordemId={selectedId} onSaveSuccess={handleSuccess} onClose={handleClose} />
      </Modal>
    </div>
  );
}
