import React, { useCallback, useEffect, useState } from 'react';
import { useVendas } from '@/hooks/useVendas';
import { seedVendas, type VendaPedido } from '@/services/vendas';
import { FileSignature, Loader2, PlusCircle, Search } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import PedidosVendasTable from '@/components/vendas/PedidosVendasTable';
import { PedidoVendaMobileCard } from '@/components/vendas/PedidoVendaMobileCard';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import PedidoVendaFormPanel from '@/components/vendas/PedidoVendaFormPanel';
import Pagination from '@/components/ui/Pagination';
import ListPaginationBar from '@/components/ui/ListPaginationBar';
import { useToast } from '@/contexts/ToastProvider';
import { SeedButton } from '@/components/common/SeedButton';
import { useSearchParams } from 'react-router-dom';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { useEditLock } from '@/components/ui/hooks/useEditLock';

export default function PropostasPage() {
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
    setPageSize,
    refresh,
  } = useVendas();
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const editLock = useEditLock('vendas:propostas');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    if (filterStatus !== 'orcamento') setFilterStatus('orcamento');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNew = () => {
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (order: VendaPedido) => {
    void openWithLock(order.id);
  };

  const clearOpenParam = useCallback(() => {
    if (!openId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [openId, searchParams, setSearchParams]);

  const handleClose = useCallback(() => {
    setIsFormOpen(false);
    setSelectedId(null);
    clearOpenParam();
    if (editingId) editLock.release(editingId);
    setEditingId(null);
  }, [clearOpenParam, editLock, editingId]);

  const openWithLock = useCallback(async (id: string) => {
    const claimed = await editLock.claim(id, {
      confirmConflict: async () =>
        confirm({
          title: 'Esta proposta já está aberta em outra aba',
          description: 'Para evitar edição concorrente, abra em apenas uma aba. Deseja abrir mesmo assim nesta aba?',
          confirmText: 'Abrir mesmo assim',
          cancelText: 'Cancelar',
          variant: 'danger',
        }),
    });
    if (!claimed) {
      clearOpenParam();
      return;
    }
    setEditingId(id);
    setSelectedId(id);
    setIsFormOpen(true);
  }, [clearOpenParam, confirm, editLock]);

  const handleSuccess = (opts?: { keepOpen?: boolean }) => {
    refresh();
    if (!selectedId && !opts?.keepOpen) handleClose();
  };

  useEffect(() => {
    if (!openId) return;
    if (isFormOpen) return;
    void openWithLock(openId);
  }, [isFormOpen, openId, openWithLock]);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedVendas();
      addToast('Pedidos criados com sucesso!', 'success');
      refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1 min-h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <FileSignature className="text-blue-600" /> Propostas Comerciais
          </h1>
          <p className="text-gray-600 text-sm mt-1">Orçamentos (status “orcamento”) antes da aprovação.</p>
        </div>
        <div className="flex items-center gap-2">
          <SeedButton onSeed={handleSeed} isSeeding={isSeeding} disabled={loading} />
          <button
            onClick={handleNew}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusCircle size={20} />
            Nova Proposta
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4 flex-shrink-0">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por número, cliente ou observações…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="text-sm text-gray-600 flex items-center">
          Filtro fixo: <span className="ml-1 font-semibold">Orçamento</span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        <div className="flex-grow overflow-auto">
          {loading ? (
            <div className="flex justify-center h-64 items-center">
              <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
            </div>
          ) : error ? (
            <div className="flex justify-center h-64 items-center text-red-500">{error}</div>
          ) : (
            <ResponsiveTable
              data={orders}
              getItemId={(o) => o.id}
              loading={loading}
              tableComponent={<PedidosVendasTable orders={orders} onEdit={handleEdit} basePath="/app/vendas/propostas" />}
              renderMobileCard={(order) => (
                <PedidoVendaMobileCard
                  key={order.id}
                  order={order}
                  onEdit={() => handleEdit(order)}
                />
              )}
            />
          )}
        </div>
        {totalCount > 0 ? (
          <ListPaginationBar innerClassName="px-3 sm:px-4">
            <Pagination
              currentPage={page}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPage(1);
                setPageSize(next);
              }}
            />
          </ListPaginationBar>
        ) : null}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Proposta' : 'Nova Proposta'} size="6xl">
        <PedidoVendaFormPanel vendaId={selectedId} onSaveSuccess={handleSuccess} onClose={handleClose} />
      </Modal>
    </div>
  );
}
