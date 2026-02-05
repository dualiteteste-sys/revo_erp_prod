import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useVendas } from '@/hooks/useVendas';
import { VendaPedido, seedVendas } from '@/services/vendas';
import { Loader2, PlusCircle, Search, ShoppingCart } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import PedidosVendasTable from '@/components/vendas/PedidosVendasTable';
import { PedidoVendaMobileCard } from '@/components/vendas/PedidoVendaMobileCard';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import PedidoVendaFormPanel from '@/components/vendas/PedidoVendaFormPanel';
import Select from '@/components/ui/forms/Select';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/contexts/ToastProvider';
import { SeedButton } from '@/components/common/SeedButton';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { useEditLock } from '@/components/ui/hooks/useEditLock';

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
    setPageSize,
    refresh,
  } = useVendas();
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const editLock = useEditLock('vendas:pedidos');

  const openFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('open');
  }, [location.search]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const clearOpenParam = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('open')) return;
    params.delete('open');
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const closeForm = useCallback(() => {
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
          title: 'Este pedido já está aberto em outra aba',
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

  const handleNew = () => {
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (order: VendaPedido) => {
    void openWithLock(order.id);
  };

  const handleClose = () => {
    closeForm();
  };

  const handleSuccess = () => {
    refresh();
    if (!selectedId) handleClose();
  };

  useEffect(() => {
    if (!openFromQuery) return;
    void openWithLock(openFromQuery);
  }, [openFromQuery, openWithLock]);

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

  const header = (
    <PageHeader
      title="Pedidos de Venda"
      description="Gestão comercial e faturamento."
      icon={<ShoppingCart size={20} />}
      actions={
        <>
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
          <SeedButton onSeed={handleSeed} isSeeding={isSeeding} disabled={loading} />
          <Button onClick={handleNew} className="gap-2">
            <PlusCircle size={18} />
            Novo Pedido
          </Button>
        </>
      }
    />
  );

  const filters = (
    <div className="flex gap-4">
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
  );

  const footer = totalCount > 0 ? (
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
  ) : null;

  return (
    <PageShell header={header} filters={filters} footer={footer}>
      <PageCard className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-auto">
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
              tableComponent={<PedidosVendasTable orders={orders} onEdit={handleEdit} />}
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
      </PageCard>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Pedido de Venda' : 'Novo Pedido de Venda'} size="6xl">
        <PedidoVendaFormPanel vendaId={selectedId} onSaveSuccess={handleSuccess} onClose={handleClose} />
      </Modal>
    </PageShell>
  );
}
