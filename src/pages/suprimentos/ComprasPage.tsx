import React, { useState, useEffect } from 'react';
import { listCompras, CompraPedido } from '@/services/compras';
import { PlusCircle, Search, ShoppingCart } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Modal from '@/components/ui/Modal';
import ComprasTable from '@/components/suprimentos/compras/ComprasTable';
import CompraFormPanel from '@/components/suprimentos/compras/CompraFormPanel';
import Select from '@/components/ui/forms/Select';

export default function ComprasPage() {
  const [orders, setOrders] = useState<CompraPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search, 500);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await listCompras(debouncedSearch, statusFilter);
      setOrders(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [debouncedSearch, statusFilter]);

  const handleNew = () => {
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (order: CompraPedido) => {
    setSelectedId(order.id);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setSelectedId(null);
  };

  const handleSuccess = () => {
    fetchOrders();
    if (!selectedId) handleClose(); // Close if it was a new order, keep open if editing to show updates
  };

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Ordens de Compra</h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de aquisições e recebimento de mercadorias.</p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Nova Compra
        </button>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por número ou fornecedor..."
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
          <option value="rascunho">Rascunho</option>
          <option value="enviado">Enviado</option>
          <option value="recebido">Recebido</option>
          <option value="cancelado">Cancelado</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : (
          <ComprasTable orders={orders} onEdit={handleEdit} />
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Pedido de Compra' : 'Novo Pedido de Compra'} size="5xl">
        <CompraFormPanel compraId={selectedId} onSaveSuccess={handleSuccess} onClose={handleClose} />
      </Modal>
    </div>
  );
}
