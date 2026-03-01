import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAuth } from '@/contexts/AuthProvider';
import { fiscalNfeGerarDePedido } from '@/services/fiscalNfeEmissoes';

export default function PedidosVendasPage() {
  const { loading: authLoading, activeEmpresaId } = useAuth();
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

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const lastHandledOpenRef = useRef<string | null>(null);
  const actionTokenRef = useRef(0);

  const openFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('open');
  }, [location.search]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [gerandoNfeId, setGerandoNfeId] = useState<string | null>(null);

  const handleGerarNfe = async (order: VendaPedido) => {
    const ok = await confirm({
      title: 'Gerar NF-e',
      description: `Deseja gerar uma Nota Fiscal Eletrônica para o pedido #${order.numero}?`,
      confirmText: 'Gerar NF-e',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;

    setGerandoNfeId(order.id);
    try {
      const emissaoId = await fiscalNfeGerarDePedido(order.id);
      addToast(`NF-e criada com sucesso! Redirecionando...`, 'success');
      navigate(`/app/fiscal/nfe-emissoes?open=${encodeURIComponent(emissaoId)}`);
    } catch (e: any) {
      const msg = e?.message || 'Erro ao gerar NF-e';
      addToast(msg, 'error');
    } finally {
      setGerandoNfeId(null);
    }
  };

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

  const resetTenantLocalState = useCallback(() => {
    setIsFormOpen(false);
    setSelectedId(null);
    if (editingId) editLock.release(editingId);
    setEditingId(null);
  }, [editLock, editingId]);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;

    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    actionTokenRef.current += 1;
    resetTenantLocalState();
    lastHandledOpenRef.current = null;

    // Se trocou de empresa com deep-link ativo, não reaproveitar o `open=` no novo tenant.
    if (prevEmpresaId && activeEmpresaId && openFromQuery) clearOpenParam();

    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId, clearOpenParam, openFromQuery, resetTenantLocalState]);

  const openWithLock = useCallback(async (id: string) => {
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;

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

    if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) {
      editLock.release(id);
      clearOpenParam();
      return;
    }

    setEditingId(id);
    setSelectedId(id);
    setIsFormOpen(true);
  }, [activeEmpresaId, clearOpenParam, confirm, editLock]);

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

  const handleSuccess = (opts?: { keepOpen?: boolean }) => {
    refresh();
    if (opts?.keepOpen) return;
    if (!selectedId) handleClose();
  };

  useEffect(() => {
    if (!openFromQuery) return;
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    if (lastHandledOpenRef.current === openFromQuery) return;
    lastHandledOpenRef.current = openFromQuery;
    void openWithLock(openFromQuery);
  }, [activeEmpresaId, authLoading, empresaChanged, openFromQuery, openWithLock]);

  const handleSeed = async () => {
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setIsSeeding(true);
    try {
      await seedVendas();
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('5 Pedidos de Venda criados com sucesso!', 'success');
      refresh();
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      console.error("Erro no seed de vendas:", e);
      addToast(e.message || 'Erro ao popular dados. Verifique se existem produtos cadastrados.', 'error');
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setIsSeeding(false);
    }
  };

  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);
  const effectiveError = empresaChanged ? null : error;
  const effectiveOrders = empresaChanged ? [] : orders;
  const effectiveTotalCount = empresaChanged ? 0 : totalCount;

  const header = (
    <PageHeader
      title="Pedidos de Venda"
      description="Gestão comercial e faturamento."
      icon={<ShoppingCart size={20} />}
      actions={
        <>
          <CsvExportDialog
            filename="pedidos-venda.csv"
            rows={effectiveOrders}
            disabled={effectiveLoading}
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
          <SeedButton onSeed={handleSeed} isSeeding={isSeeding} disabled={effectiveLoading} />
          <Button onClick={handleNew} className="gap-2" disabled={effectiveLoading}>
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

  if (authLoading) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  if (!activeEmpresaId) {
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver pedidos de venda.</div>;
  }

  const footer = effectiveTotalCount > 0 ? (
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
  ) : null;

  return (
    <PageShell header={header} filters={filters} footer={footer}>
      <PageCard className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-auto">
          {effectiveLoading ? (
            <div className="flex justify-center h-64 items-center">
              <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
            </div>
          ) : effectiveError ? (
            <div className="flex justify-center h-64 items-center text-red-500">{effectiveError}</div>
          ) : (
            <ResponsiveTable
              data={effectiveOrders}
              getItemId={(o) => o.id}
              loading={effectiveLoading}
              tableComponent={<PedidosVendasTable orders={effectiveOrders} onEdit={handleEdit} onGerarNfe={handleGerarNfe} gerandoNfeId={gerandoNfeId} />}
              renderMobileCard={(order) => (
                <PedidoVendaMobileCard
                  key={order.id}
                  order={order}
                  onEdit={() => handleEdit(order)}
                  onGerarNfe={() => handleGerarNfe(order)}
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
