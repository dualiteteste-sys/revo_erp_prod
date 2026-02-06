import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listCompras, CompraPedido } from '@/services/compras';
import { PlusCircle, Search, ShoppingCart } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Modal from '@/components/ui/Modal';
import ComprasTable from '@/components/suprimentos/compras/ComprasTable';
import CompraFormPanel from '@/components/suprimentos/compras/CompraFormPanel';
import Select from '@/components/ui/forms/Select';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import Pagination from '@/components/ui/Pagination';
import ListPaginationBar from '@/components/ui/ListPaginationBar';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';

export default function ComprasPage() {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<CompraPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const handledOpenRef = useRef(false);

  const resetTenantLocalState = useCallback(() => {
    setIsFormOpen(false);
    setSelectedId(null);
  }, []);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;

    resetTenantLocalState();
    setOrders([]);
    setTotalCount(0);
    handledOpenRef.current = false;

    const openId = searchParams.get('open');
    if (prevEmpresaId && activeEmpresaId && openId) {
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }

    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId, resetTenantLocalState, searchParams, setSearchParams]);

  const fetchOrders = useCallback(async () => {
    if (!activeEmpresaId) {
      setOrders([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await listCompras({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setOrders(data);
      const count = Number((data?.[0] as any)?.total_count ?? 0);
      setTotalCount(Number.isFinite(count) ? count : 0);
    } catch (e) {
      console.error(e);
      setOrders([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, debouncedSearch, page, pageSize, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (handledOpenRef.current) return;
    if (authLoading || !activeEmpresaId || empresaChanged) return;

    const openId = searchParams.get('open');
    if (!openId) {
      handledOpenRef.current = true;
      return;
    }
    handledOpenRef.current = true;

    setSelectedId(openId);
    setIsFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [activeEmpresaId, authLoading, empresaChanged, searchParams, setSearchParams]);

  useEffect(() => {
    setPage(1);
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

  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);
  const effectiveOrders = empresaChanged ? [] : orders;
  const effectiveTotalCount = empresaChanged ? 0 : totalCount;

  if (authLoading) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  if (!activeEmpresaId) {
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver ordens de compra.</div>;
  }

  return (
    <div className="p-1 min-h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Ordens de Compra</h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de aquisições e recebimento de mercadorias.</p>
        </div>
        <div className="flex items-center gap-2">
          <CsvExportDialog
            filename="ordens-compra.csv"
            rows={effectiveOrders}
            disabled={effectiveLoading}
            columns={[
              { key: 'numero', label: 'Número', getValue: (r) => r.numero },
              { key: 'fornecedor', label: 'Fornecedor', getValue: (r) => r.fornecedor_nome ?? '' },
              { key: 'data', label: 'Data emissão', getValue: (r) => r.data_emissao ?? '' },
              { key: 'status', label: 'Status', getValue: (r) => r.status },
              { key: 'total', label: 'Total geral', getValue: (r) => r.total_geral },
            ]}
          />
          <button
            onClick={handleNew}
            disabled={effectiveLoading}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusCircle size={20} />
            Nova Compra
          </button>
        </div>
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

      <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col flex-1 min-h-0 min-h-[400px]">
        <div className="flex-1 min-h-0 overflow-auto">
          {effectiveLoading ? (
            <div className="flex justify-center h-64 items-center">
              <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
            </div>
          ) : (
            <ComprasTable orders={effectiveOrders} onEdit={handleEdit} />
          )}
        </div>
      </div>

      {effectiveTotalCount > 0 ? (
        <ListPaginationBar className="mt-4" innerClassName="px-3 sm:px-4">
          <Pagination
            currentPage={page}
            totalCount={effectiveTotalCount}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPage(1);
              setPageSize(next);
            }}
          />
        </ListPaginationBar>
      ) : null}

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Pedido de Compra' : 'Novo Pedido de Compra'} size="5xl">
        <CompraFormPanel compraId={selectedId} onSaveSuccess={handleSuccess} onClose={handleClose} />
      </Modal>
    </div>
  );
}
