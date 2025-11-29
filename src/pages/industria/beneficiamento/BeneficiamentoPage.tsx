import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { listOrdensBeneficiamento, OrdemBeneficiamento, seedOrdensBeneficiamento } from '@/services/industriaBeneficiamento';
import { PlusCircle, Search, LayoutGrid, List, Layers, DatabaseBackup } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/forms/Select';
import BeneficiamentoTable from '@/components/industria/beneficiamento/BeneficiamentoTable';
import BeneficiamentoFormPanel from '@/components/industria/beneficiamento/BeneficiamentoFormPanel';
import BeneficiamentoKanbanBoard from '@/components/industria/beneficiamento/BeneficiamentoKanbanBoard';
import { useToast } from '@/contexts/ToastProvider';

export default function BeneficiamentoPage() {
  const location = useLocation();
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [orders, setOrders] = useState<OrdemBeneficiamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<any>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Check for navigation state from ConferenciaPage
  useEffect(() => {
    if (location.state?.createFromRecebimento) {
        setInitialData(location.state.createFromRecebimento);
        setIsFormOpen(true);
        // Clear state to prevent reopening on refresh (optional, but good practice)
        window.history.replaceState({}, document.title);
    }
  }, [location]);

  const fetchOrders = async () => {
    if (viewMode === 'kanban') return;
    setLoading(true);
    try {
      const data = await listOrdensBeneficiamento(debouncedSearch, statusFilter || undefined);
      setOrders(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [debouncedSearch, statusFilter, viewMode]);

  const handleNew = () => {
    setSelectedId(null);
    setInitialData(null);
    setIsFormOpen(true);
  };

  const handleEdit = (order: OrdemBeneficiamento) => {
    setSelectedId(order.id);
    setInitialData(null);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setSelectedId(null);
    setInitialData(null);
  };

  const handleSuccess = () => {
    if (viewMode === 'list') fetchOrders();
    if (!selectedId) handleClose();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedOrdensBeneficiamento();
      addToast('5 Ordens de Beneficiamento criadas com sucesso!', 'success');
      if (viewMode === 'list') fetchOrders();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Layers className="text-purple-600" /> Ordens de Beneficiamento
          </h1>
          <p className="text-gray-600 text-sm mt-1">Serviços em materiais de terceiros.</p>
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
              onClick={handleSeed}
              disabled={isSeeding || loading}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
              Popular Dados
            </button>
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
                placeholder="Buscar por número, cliente ou ref..."
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
            <option value="aguardando_material">Aguardando Material</option>
            <option value="em_beneficiamento">Em Beneficiamento</option>
            <option value="parcialmente_entregue">Parcialmente Entregue</option>
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
                <BeneficiamentoTable orders={orders} onEdit={handleEdit} />
                )}
            </div>
        ) : (
            <BeneficiamentoKanbanBoard />
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Ordem de Beneficiamento' : 'Nova Ordem de Beneficiamento'} size="6xl">
        <BeneficiamentoFormPanel 
            ordemId={selectedId} 
            initialData={initialData}
            onSaveSuccess={handleSuccess} 
            onClose={handleClose} 
        />
      </Modal>
    </div>
  );
}
