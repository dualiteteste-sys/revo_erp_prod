import React, { useState } from 'react';
import { useVendas } from '@/hooks/useVendas';
import { VendaPedido, seedVendas } from '@/services/vendas';
import { PlusCircle, Search, ShoppingCart } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import PedidosVendasTable from '@/components/vendas/PedidosVendasTable';
import PedidoVendaFormPanel from '@/components/vendas/PedidoVendaFormPanel';
import Select from '@/components/ui/forms/Select';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/contexts/ToastProvider';
import { SeedButton } from '@/components/common/SeedButton';
import CsvExportDialog from '@/components/ui/CsvExportDialog';

export default function PedidosVendasPage() {
  const {
    orders,
    totalCount,
    loading,
    error,
    searchTerm,
    filterStatus,
    page,
    pageSize,
    setSearchTerm,
    setFilterStatus,
    setPage,
    refresh,
  } = useVendas();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const handleNew = () => {
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (order: VendaPedido) => {
    setSelectedId(order.id);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setSelectedId(null);
  };

  const handleSuccess = () => {
    refresh();
    if (!selectedId) handleClose();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedVendas();
      addToast('5 Pedidos de Venda criados com sucesso!', 'success');
      refresh();
    } catch (e: any) {
      console.error("Erro no seed de vendas:", e);
      addToast(e.message || 'Erro ao popular dados. Verifique se existem produtos cadastrados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <ShoppingCart className="text-blue-600" /> Pedidos de Venda
          </h1>
          <p className="text-gray-600 text-sm mt-1">Gestão comercial e faturamento.</p>
        </div>
        <div className="flex items-center gap-2">
            <CsvExportDialog
              filename="pedidos-venda.csv"
              rows={orders}
              disabled={loading}
              columns={[
                { key: 'numero', label: 'Número', getValue: (r) => r.numero },
                { key: 'cliente', label: 'Cliente', getValue: (r) => r.cliente_nome ?? '' },
                { key: 'canal', label: 'Canal', getValue: (r) => (r as any).canal ?? '' },
                { key: 'data', label: 'Data emissão', getValue: (r) => r.data_emissao ?? '' },
                { key: 'status', label: 'Status', getValue: (r) => r.status ?? '' },
                { key: 'total', label: 'Total geral', getValue: (r) => (r as any).total_geral ?? '' },
                { key: 'vendedor', label: 'Vendedor', getValue: (r) => (r as any).vendedor_nome ?? '' },
                { key: 'comissao', label: 'Comissão (%)', getValue: (r) => (r as any).comissao_percent ?? '' },
              ]}
            />
            <SeedButton 
              onSeed={handleSeed} 
              isSeeding={isSeeding} 
              disabled={loading} 
            />
            <button
              onClick={handleNew}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle size={20} />
              Novo Pedido
            </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4 flex-shrink-0">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por número ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value || null)}
          className="min-w-[200px]"
        >
          <option value="">Todos os Status</option>
          <option value="orcamento">Orçamento</option>
          <option value="aprovado">Aprovado</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        <div className="flex-grow overflow-auto">
            {loading ? (
            <div className="flex justify-center h-64 items-center">
                <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
            </div>
            ) : error ? (
            <div className="flex justify-center h-64 items-center text-red-500">
                {error}
            </div>
            ) : (
            <PedidosVendasTable orders={orders} onEdit={handleEdit} />
            )}
        </div>
        {totalCount > pageSize && (
            <div className="border-t border-gray-200 px-4">
                <Pagination 
                    currentPage={page} 
                    totalCount={totalCount} 
                    pageSize={pageSize} 
                    onPageChange={setPage} 
                />
            </div>
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Pedido de Venda' : 'Novo Pedido de Venda'} size="6xl">
        <PedidoVendaFormPanel vendaId={selectedId} onSaveSuccess={handleSuccess} onClose={handleClose} />
      </Modal>
    </div>
  );
}
