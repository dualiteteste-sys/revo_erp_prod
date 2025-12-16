import React, { useState, useEffect } from 'react';
import { listOrdens, OrdemIndustria } from '@/services/industria';
import { PlusCircle, Search, LayoutGrid, List } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Modal from '@/components/ui/Modal';
import OrdensTable from '@/components/industria/ordens/OrdensTable';
import OrdemFormPanel from '@/components/industria/ordens/OrdemFormPanel';
import IndustriaKanbanBoard from '@/components/industria/kanban/IndustriaKanbanBoard';
import Select from '@/components/ui/forms/Select';
import { useSearchParams } from 'react-router-dom';

export default function OrdensPage() {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [orders, setOrders] = useState<OrdemIndustria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search, 500);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const tipoOrdem = (searchParams.get('tipo') === 'beneficiamento' ? 'beneficiamento' : 'industrializacao') as
    | 'industrializacao'
    | 'beneficiamento';

  // Deep-link: /app/industria/ordens?tipo=beneficiamento&new=1
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setSelectedId(null);
    setIsFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchOrders = async () => {
    if (viewMode === 'kanban') return; // Kanban fetches its own data
    setLoading(true);
    try {
      const data = await listOrdens(debouncedSearch, tipoOrdem, statusFilter || undefined);
      setOrders(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [debouncedSearch, statusFilter, viewMode, tipoOrdem]);

  const handleNew = () => {
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (order: OrdemIndustria) => {
    setSelectedId(order.id);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setSelectedId(null);
  };

  const handleSuccess = () => {
    if (viewMode === 'list') fetchOrders();
    // If kanban, we might need to force refresh the board, but for now let's rely on user navigation or manual refresh
    if (!selectedId) handleClose();
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

      {viewMode === 'list' && (
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
            <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-w-[200px]"
            >
            <option value="">Todos os Status</option>
            <option value="planejada">Planejada</option>
            <option value="em_producao">Em Produção</option>
            <option value="concluida">Concluída</option>
            </Select>
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
                <OrdensTable orders={orders} onEdit={handleEdit} />
                )}
            </div>
        ) : (
            <IndustriaKanbanBoard />
        )}
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={handleClose}
        title={selectedId ? 'Editar Ordem' : (tipoOrdem === 'beneficiamento' ? 'Nova Ordem de Beneficiamento' : 'Nova Ordem de Industrialização')}
        size="6xl"
      >
        <OrdemFormPanel ordemId={selectedId} initialTipoOrdem={tipoOrdem} onSaveSuccess={handleSuccess} onClose={handleClose} />
      </Modal>
    </div>
  );
}
