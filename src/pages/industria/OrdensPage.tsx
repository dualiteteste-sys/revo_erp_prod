import React, { useState, useEffect, useMemo, useRef } from 'react';
import { cloneOrdem, listOrdens, OrdemIndustria } from '@/services/industria';
import { listOrdensProducao, OrdemProducao } from '@/services/industriaProducao';
import { PlusCircle, Search, LayoutGrid, List } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Modal from '@/components/ui/Modal';
import OrdensTable from '@/components/industria/ordens/OrdensTable';
import OrdemFormPanel from '@/components/industria/ordens/OrdemFormPanel';
import IndustriaKanbanBoard from '@/components/industria/kanban/IndustriaKanbanBoard';
import Select from '@/components/ui/forms/Select';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/contexts/ToastProvider';
import ProducaoFormPanel from '@/components/industria/producao/ProducaoFormPanel';
import ProducaoKanbanBoard from '@/components/industria/producao/ProducaoKanbanBoard';

export default function OrdensPage() {
  const { addToast } = useToast();
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [orders, setOrders] = useState<OrdemIndustria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const hasShownRpcHint = useRef(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [initialPrefill, setInitialPrefill] = useState<React.ComponentProps<typeof OrdemFormPanel>['initialPrefill']>();
  const [draftTipoOrdem, setDraftTipoOrdem] = useState<'industrializacao' | 'beneficiamento'>('industrializacao');
  const [kanbanRefresh, setKanbanRefresh] = useState(0);

  const tipoOrdem = (searchParams.get('tipo') === 'beneficiamento' ? 'beneficiamento' : 'industrializacao') as
    | 'industrializacao'
    | 'beneficiamento';

  const statusOptions = useMemo(() => {
    if (tipoOrdem === 'industrializacao') {
      return [
        { value: '', label: 'Todos os Status' },
        { value: 'planejada', label: 'Planejada' },
        { value: 'em_programacao', label: 'Em Programação' },
        { value: 'em_producao', label: 'Em Produção' },
        { value: 'em_inspecao', label: 'Em Inspeção' },
        { value: 'concluida', label: 'Concluída' },
        { value: 'cancelada', label: 'Cancelada' },
      ];
    }

    return [
      { value: '', label: 'Todos os Status' },
      { value: 'rascunho', label: 'Rascunho' },
      { value: 'planejada', label: 'Planejada' },
      { value: 'em_programacao', label: 'Em Programação' },
      { value: 'em_beneficiamento', label: 'Em Beneficiamento' },
      { value: 'parcialmente_entregue', label: 'Parcialmente Entregue' },
      { value: 'concluida', label: 'Concluída' },
      { value: 'cancelada', label: 'Cancelada' },
    ];
  }, [tipoOrdem]);

  // Deep-link: /app/industria/ordens?tipo=beneficiamento&new=1
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    const statePrefill =
      tipoOrdem === 'beneficiamento'
        ? ((location.state as any)?.prefill as React.ComponentProps<typeof OrdemFormPanel>['initialPrefill'] | undefined)
        : undefined;
    setInitialPrefill(statePrefill);
    setDraftTipoOrdem(tipoOrdem);
    setSelectedId(null);
    setIsFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    navigate(
      { pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : '' },
      { replace: true, state: null }
    );
  }, [searchParams, location.pathname, location.state, navigate]);

  const fetchOrders = async () => {
    if (viewMode === 'kanban') return; // Kanban fetches its own data
    setLoading(true);
    try {
      if (tipoOrdem === 'industrializacao') {
        const data = await listOrdensProducao(debouncedSearch, statusFilter || undefined);
        setOrders(
          data.map(
            (o: OrdemProducao): OrdemIndustria => ({
              id: o.id,
              numero: o.numero,
              tipo_ordem: 'industrializacao',
              produto_nome: o.produto_nome,
              cliente_nome: null,
              quantidade_planejada: o.quantidade_planejada,
              unidade: o.unidade,
              status: o.status as any,
              prioridade: o.prioridade,
              data_prevista_entrega: o.data_prevista_entrega || null,
              total_entregue: o.total_entregue,
            })
          )
        );
      } else {
        const data = await listOrdens(debouncedSearch, tipoOrdem, statusFilter || undefined);
        setOrders(data);
      }
    } catch (e) {
      console.error(e);
      const message = (e as any)?.message || 'Erro ao carregar ordens.';
      if (
        !hasShownRpcHint.current &&
        typeof message === 'string' &&
        message.includes('industria_list_ordens') &&
        message.includes('HTTP_404')
      ) {
        hasShownRpcHint.current = true;
        addToast(
          "RPC 'industria_list_ordens' não encontrada. Verifique se as migrações do módulo OP/OB foram aplicadas e recarregue o schema cache do Supabase (NOTIFY pgrst, 'reload schema').",
          'error'
        );
      } else {
        addToast(message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [debouncedSearch, statusFilter, viewMode, tipoOrdem]);

  const handleNew = () => {
    setDraftTipoOrdem(tipoOrdem);
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (order: OrdemIndustria) => {
    setSelectedId(order.id);
    setIsFormOpen(true);
  };

  const handleClone = async (order: OrdemIndustria) => {
    if (tipoOrdem === 'industrializacao') return;
    try {
      const cloned = await cloneOrdem(order.id);
      setSelectedId(cloned.id);
      setIsFormOpen(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenFromKanban = (order: OrdemIndustria) => {
    setSelectedId(order.id);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setSelectedId(null);
    setInitialPrefill(undefined);
  };

  const handleSuccess = () => {
    if (viewMode === 'list') fetchOrders();
    if (viewMode === 'kanban') setKanbanRefresh(k => k + 1);
  };

  const handleDraftTipoChange = (nextTipo: 'industrializacao' | 'beneficiamento') => {
    if (selectedId) return; // só para novas ordens
    const next = new URLSearchParams(searchParams);
    next.set('tipo', nextTipo);
    setStatusFilter('');
    setSearchParams(next, { replace: true });
    setInitialPrefill(undefined);
    setDraftTipoOrdem(nextTipo);
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            {tipoOrdem === 'beneficiamento' ? 'Ordens de Beneficiamento' : 'Ordens de Industrialização'}
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            {tipoOrdem === 'beneficiamento' ? 'Gestão de beneficiamento de materiais (cliente/terceiros).' : 'Gestão de ordens de industrialização.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            <button
            onClick={handleNew}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
            <PlusCircle size={20} />
            Nova Ordem
            </button>
        </div>
      </div>

      {(
        <div className="mb-6 flex gap-4 flex-shrink-0">
            <div className="relative flex-grow max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
                type="text"
                placeholder="Buscar por número, produto ou cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            </div>
            <Select
              value={tipoOrdem}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                next.set('tipo', e.target.value);
                setSearchParams(next, { replace: true });
              }}
              className="min-w-[220px]"
            >
              <option value="industrializacao">Industrialização</option>
              <option value="beneficiamento">Beneficiamento</option>
            </Select>
            {viewMode === 'list' && (
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-w-[200px]"
              >
                {statusOptions.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
        </div>
      )}

      <div className="flex-grow overflow-hidden">
        {viewMode === 'list' ? (
            <div className="bg-white rounded-lg shadow overflow-hidden h-full overflow-y-auto">
                {loading ? (
                <div className="flex justify-center h-64 items-center">
                    <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
                </div>
                ) : (
                <OrdensTable orders={orders} onEdit={handleEdit} onClone={tipoOrdem === 'beneficiamento' ? handleClone : undefined} />
                )}
            </div>
        ) : (
            tipoOrdem === 'industrializacao' ? (
              <ProducaoKanbanBoard
                search={debouncedSearch}
                statusFilter={statusFilter}
                onOpenOrder={(order: any) => handleOpenFromKanban({ ...(order as any), tipo_ordem: 'industrializacao' })}
              />
            ) : (
              <IndustriaKanbanBoard
                tipoOrdem={tipoOrdem}
                search={debouncedSearch}
                refreshToken={kanbanRefresh}
                onOpenOrder={handleOpenFromKanban}
                onCloneOrder={handleClone}
              />
            )
        )}
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={handleClose}
        title={
          selectedId
            ? 'Editar Ordem'
            : ((selectedId ? tipoOrdem : draftTipoOrdem) === 'beneficiamento'
              ? 'Nova Ordem de Beneficiamento'
              : 'Nova Ordem de Industrialização')
        }
        size="6xl"
      >
        {(selectedId ? tipoOrdem : draftTipoOrdem) === 'industrializacao' ? (
          <ProducaoFormPanel
            ordemId={selectedId}
            onSaveSuccess={handleSuccess}
            onClose={handleClose}
            allowTipoOrdemChange={!selectedId}
            onTipoOrdemChange={handleDraftTipoChange}
          />
        ) : (
          <OrdemFormPanel
            ordemId={selectedId}
            initialTipoOrdem={selectedId ? tipoOrdem : draftTipoOrdem}
            initialPrefill={selectedId ? undefined : initialPrefill}
            allowTipoOrdemChange={!selectedId && !initialPrefill}
            onTipoOrdemChange={handleDraftTipoChange}
            onSaveSuccess={handleSuccess}
            onClose={handleClose}
          />
        )}
      </Modal>
    </div>
  );
}
