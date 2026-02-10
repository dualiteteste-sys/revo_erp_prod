import React, { useEffect, useRef, useState } from 'react';
import { useContasPagar } from '@/hooks/useContasPagar';
import { useToast } from '@/contexts/ToastProvider';
import * as financeiroService from '@/services/financeiro';
import { Loader2, PlusCircle, Search, TrendingDown, X, DatabaseBackup } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ListPaginationBar from '@/components/ui/ListPaginationBar';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import ContasPagarTable from '@/components/financeiro/contas-pagar/ContasPagarTable';
import { ContaPagarMobileCard } from '@/components/financeiro/contas-pagar/ContaPagarMobileCard';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import ContasPagarFormPanel from '@/components/financeiro/contas-pagar/ContasPagarFormPanel';
import ContasPagarSummary from '@/components/financeiro/contas-pagar/ContasPagarSummary';
import BaixaRapidaModal from '@/components/financeiro/common/BaixaRapidaModal';
import EstornoRecebimentoModal from '@/components/financeiro/common/EstornoRecebimentoModal';
import Select from '@/components/ui/forms/Select';
import DatePicker from '@/components/ui/DatePicker';
import ErrorAlert from '@/components/ui/ErrorAlert';
import { Button } from '@/components/ui/button';
import { isSeedEnabled } from '@/utils/seed';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { useResultSetSelection } from '@/hooks/useResultSetSelection';
import SelectionTotalizerBar from '@/components/financeiro/SelectionTotalizerBar';
import { useFinanceiroSelectionTotals } from '@/hooks/useFinanceiroSelectionTotals';

const ContasPagarPage: React.FC = () => {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const enableSeed = isSeedEnabled();
  const {
    contas,
    summary,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    filterStartDate,
    filterEndDate,
    sortBy,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterStatus,
    setFilterStartDate,
    setFilterEndDate,
    setSortBy,
    refresh,
  } = useContasPagar();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<financeiroService.ContaPagar | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [contaToDelete, setContaToDelete] = useState<financeiroService.ContaPagar | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [contaToCancel, setContaToCancel] = useState<financeiroService.ContaPagar | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isBaixaOpen, setIsBaixaOpen] = useState(false);
  const [contaToPay, setContaToPay] = useState<financeiroService.ContaPagar | null>(null);
  const [isEstornoOpen, setIsEstornoOpen] = useState(false);
  const [contaToReverse, setContaToReverse] = useState<financeiroService.ContaPagar | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const handledContaIdRef = useRef(false);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;

    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setIsFormOpen(false);
    setSelectedConta(null);
    setIsDeleteModalOpen(false);
    setContaToDelete(null);
    setIsDeleting(false);
    setIsCancelOpen(false);
    setCanceling(false);
    setContaToCancel(null);
    setCancelMotivo('');
    setIsFetchingDetails(false);
    setIsBaixaOpen(false);
    setContaToPay(null);
    setIsEstornoOpen(false);
    setContaToReverse(null);

    const contaId = searchParams.get('contaId');
    if (contaId) {
      const next = new URLSearchParams(searchParams);
      next.delete('contaId');
      setSearchParams(next, { replace: true });
    }

    if (prevEmpresaId && activeEmpresaId) {
      addToast('Empresa alterada. Recarregando contas a pagar…', 'info');
    }

    lastEmpresaIdRef.current = activeEmpresaId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresaId]);

  const handleOpenForm = async (conta: financeiroService.ContaPagar | null = null) => {
    if (conta?.id) {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedConta(null);
      try {
        const details = await financeiroService.getContaPagarDetails(conta.id);
        setSelectedConta(details);
      } catch (e: any) {
        addToast(e.message, 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
      }
    } else {
      setSelectedConta(null);
      setIsFormOpen(true);
    }
  };

  useEffect(() => {
    if (handledContaIdRef.current) return;
    if (authLoading || !activeEmpresaId || empresaChanged) return;

    const contaId = searchParams.get('contaId');
    if (!contaId) {
      handledContaIdRef.current = true;
      return;
    }
    handledContaIdRef.current = true;

    void (async () => {
      await handleOpenForm({ id: contaId } as any);
      const next = new URLSearchParams(searchParams);
      next.delete('contaId');
      setSearchParams(next, { replace: true });
    })();
  }, [activeEmpresaId, authLoading, empresaChanged, handleOpenForm, searchParams, setSearchParams]);

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedConta(null);
  };

  const handleSaveSuccess = () => {
    refresh();
    handleCloseForm();
  };

  const handleOpenDeleteModal = (conta: financeiroService.ContaPagar) => {
    setContaToDelete(conta);
    setIsDeleteModalOpen(true);
  };

  const handleOpenCancel = (conta: financeiroService.ContaPagar) => {
    setContaToCancel(conta);
    setCancelMotivo('');
    setIsCancelOpen(true);
  };

  const handleCloseCancel = () => {
    setIsCancelOpen(false);
    setContaToCancel(null);
    setCancelMotivo('');
  };

  const handleCancel = async () => {
    if (!contaToCancel?.id) return;
    setCanceling(true);
    try {
      await financeiroService.cancelarContaPagar({ id: contaToCancel.id, motivo: cancelMotivo || null });
      addToast('Conta a pagar cancelada.', 'success');
      refresh();
      handleCloseCancel();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao cancelar.', 'error');
    } finally {
      setCanceling(false);
    }
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setContaToDelete(null);
  };

  const handleDelete = async () => {
    if (!contaToDelete?.id) return;
    setIsDeleting(true);
    try {
      await financeiroService.deleteContaPagar(contaToDelete.id);
      addToast('Conta a pagar excluída com sucesso!', 'success');
      refresh();
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePay = async (conta: financeiroService.ContaPagar) => {
    if (!conta?.id) return;
    setContaToPay(conta);
    setIsBaixaOpen(true);
  };

  const handleOpenReverse = (conta: financeiroService.ContaPagar) => {
    setContaToReverse(conta);
    setIsEstornoOpen(true);
  };

  const handleCloseReverse = () => {
    setIsEstornoOpen(false);
    setContaToReverse(null);
  };

  const handleCloseBaixa = () => {
    setIsBaixaOpen(false);
    setContaToPay(null);
  };

  const handleSort = (column: string) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };

  const clearDateFilters = () => {
    setFilterStartDate(null);
    setFilterEndDate(null);
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await financeiroService.seedContasPagar();
      addToast('5 Contas a Pagar criadas com sucesso!', 'success');
      refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);
  const effectiveError = empresaChanged ? null : error;
  const effectiveContas = empresaChanged ? [] : contas;
  const canShowSummary = !empresaChanged && !!summary;

  const pageIds = React.useMemo(() => effectiveContas.map((c) => c.id), [effectiveContas]);
  const filterSignature = React.useMemo(() => {
    return JSON.stringify({
      q: searchTerm,
      status: filterStatus,
      start: filterStartDate ? filterStartDate.toISOString().slice(0, 10) : null,
      end: filterEndDate ? filterEndDate.toISOString().slice(0, 10) : null,
      sortBy,
      count,
    });
  }, [count, filterEndDate, filterStartDate, filterStatus, searchTerm, sortBy]);

  const selection = useResultSetSelection({
    pageIds,
    totalMatchingCount: count,
    filterSignature,
    empresaId: activeEmpresaId,
    onAutoReset: (reason) => {
      if (reason === 'filters_changed') {
        addToast('Seleção limpa porque os filtros mudaram.', 'info');
      }
    },
  });

  const selectedIdsOnPage = React.useMemo(() => {
    return new Set(pageIds.filter((id) => selection.isSelected(id)));
  }, [pageIds, selection]);

  const totalsReq = React.useMemo(() => {
    if (selection.selectedCount <= 0) return null;
    return {
      mode: selection.mode,
      ids: selection.mode === 'explicit' ? Array.from(selection.selectedIds) : [],
      excludedIds: selection.mode === 'all_matching' ? Array.from(selection.excludedIds) : [],
      q: searchTerm || null,
      status: filterStatus || null,
      startDateISO: filterStartDate ? filterStartDate.toISOString().slice(0, 10) : null,
      endDateISO: filterEndDate ? filterEndDate.toISOString().slice(0, 10) : null,
    };
  }, [filterEndDate, filterStartDate, filterStatus, searchTerm, selection]);

  const totalsState = useFinanceiroSelectionTotals({
    enabled: selection.selectedCount > 0,
    request: totalsReq,
    fetcher: (req) =>
      financeiroService.getContasPagarSelectionTotals({
        mode: req.mode,
        ids: req.ids,
        excludedIds: req.excludedIds,
        q: req.q,
        status: req.status,
        startDateISO: req.startDateISO,
        endDateISO: req.endDateISO,
      }),
  });

  useEffect(() => {
    if (!totalsState.error) return;
    addToast(totalsState.error, 'error');
  }, [addToast, totalsState.error]);

  if (authLoading) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  if (!activeEmpresaId) {
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver contas a pagar.</div>;
  }

  return (
    <div className="p-1 min-h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Contas a Pagar</h1>
        <div className="flex items-center gap-2">
          {enableSeed ? (
            <Button
              variant="secondary"
              onClick={handleSeed}
              disabled={isSeeding || loading}
              className="gap-2"
            >
              {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
              Popular Dados
            </Button>
          ) : null}
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <PlusCircle size={18} />
            Nova Conta
          </Button>
        </div>
      </div>

      {effectiveError ? (
        <div className="my-8">
          <ErrorAlert
            title="Erro ao carregar dados"
            message={effectiveError}
            onRetry={refresh}
          />
        </div>
      ) : (
        <>
          {canShowSummary ? <ContasPagarSummary summary={summary} /> : null}

          <div className="mt-6 mb-4 flex flex-wrap gap-4 items-end">
            <div className="relative flex-grow max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar por descrição ou fornecedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <Select
              value={filterStatus || ''}
              onChange={(e) => setFilterStatus(e.target.value || null)}
              className="min-w-[180px]"
            >
              <option value="">Todos os status</option>
              <option value="aberta">Em aberto</option>
              <option value="vencidas">Vencidas</option>
              <option value="parcial">Parcial</option>
              <option value="paga">Paga</option>
              <option value="cancelada">Cancelada</option>
            </Select>

            <div className="flex items-center gap-3">
              <DatePicker
                label=""
                value={filterStartDate}
                onChange={setFilterStartDate}
                className="w-[200px]"
              />
              <span className="text-gray-500 whitespace-nowrap px-1">até</span>
              <DatePicker
                label=""
                value={filterEndDate}
                onChange={setFilterEndDate}
                className="w-[200px]"
              />
              {(filterStartDate || filterEndDate) && (
                <button
                  onClick={clearDateFilters}
                  className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  title="Limpar datas"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-auto">
              <SelectionTotalizerBar
                mode={selection.mode}
                selectedCount={selection.selectedCount}
                totalMatchingCount={count}
                loading={totalsState.loading}
                totals={[
                  { key: 'bruto', label: 'Bruto', value: totalsState.data?.total_bruto ?? null },
                  { key: 'pago', label: 'Pago', value: totalsState.data?.total_pago ?? null },
                  { key: 'saldo', label: 'Saldo', value: totalsState.data?.total_saldo ?? null },
                  { key: 'vencido', label: 'Vencido', value: totalsState.data?.total_vencido ?? null },
                  { key: 'a_vencer', label: 'A vencer', value: totalsState.data?.total_a_vencer ?? null },
                ]}
                onSelectAllMatching={() => selection.selectAllMatching()}
                onClear={() => selection.clear()}
              />
              {effectiveLoading && effectiveContas.length === 0 ? (
                <div className="h-96 flex items-center justify-center">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                </div>
              ) : effectiveContas.length === 0 ? (
                <div className="h-96 flex flex-col items-center justify-center text-gray-500">
                  <TrendingDown size={48} className="mb-4" />
                  <p>Nenhuma conta a pagar encontrada.</p>
                  {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
                </div>
              ) : (
                <ResponsiveTable
                  data={effectiveContas}
                  getItemId={(c) => c.id}
                  loading={effectiveLoading}
                  tableComponent={
                    <ContasPagarTable
                      contas={effectiveContas}
                      onEdit={handleOpenForm}
                      onPay={handlePay}
                      onReverse={handleOpenReverse}
                      onCancel={handleOpenCancel}
                      onDelete={handleOpenDeleteModal}
                      sortBy={sortBy}
                      onSort={handleSort}
                      selectedIds={selectedIdsOnPage}
                      allSelected={selection.allOnPageSelected}
                      someSelected={selection.someOnPageSelected}
                      onToggleSelect={selection.toggleOne}
                      onToggleSelectAll={selection.togglePage}
                    />
                  }
                  renderMobileCard={(conta) => (
                    <ContaPagarMobileCard
                      key={conta.id}
                      conta={conta}
                      selected={selection.isSelected(conta.id)}
                      onToggleSelect={selection.toggleOne}
                      onEdit={() => handleOpenForm(conta)}
                      onPay={() => handlePay(conta)}
                      onReverse={() => handleOpenReverse(conta)}
                      onCancel={() => handleOpenCancel(conta)}
                      onDelete={() => handleOpenDeleteModal(conta)}
                    />
                  )}
                />
              )}
            </div>
          </div>

          {count > 0 ? (
            <ListPaginationBar className="mt-4" innerClassName="px-3 sm:px-4">
              <Pagination
                currentPage={page}
                totalCount={count}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(next) => {
                  setPage(1);
                  setPageSize(next);
                }}
              />
            </ListPaginationBar>
          ) : null}
        </>
      )}

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedConta ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}>
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[500px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <ContasPagarFormPanel conta={selectedConta} onSaveSuccess={handleSaveSuccess} onMutate={refresh} onClose={handleCloseForm} />
        )}
      </Modal>

      <BaixaRapidaModal
        isOpen={isBaixaOpen}
        onClose={handleCloseBaixa}
        title="Registrar pagamento"
        description={
          contaToPay?.descricao
            ? `Confirmar pagamento da conta "${contaToPay.descricao}".`
            : 'Confirmar pagamento.'
        }
        defaultValor={Number(contaToPay?.saldo ?? (
          Number(contaToPay?.valor_total || 0) +
          Number(contaToPay?.multa || 0) +
          Number(contaToPay?.juros || 0) -
          Number(contaToPay?.desconto || 0)
        )) || 0}
        confirmLabel="Registrar pagamento"
        onConfirm={async ({ contaCorrenteId, dataISO, valor }) => {
          if (!contaToPay?.id) return;
          try {
            await financeiroService.pagarContaPagar({
              id: contaToPay.id,
              dataPagamento: dataISO,
              valorPago: valor,
              contaCorrenteId,
            });
            addToast('Pagamento registrado com sucesso!', 'success');
            refresh();
          } catch (e: any) {
            addToast(e?.message || 'Erro ao registrar pagamento.', 'error');
            throw e;
          }
        }}
      />

      <EstornoRecebimentoModal
        isOpen={isEstornoOpen}
        onClose={handleCloseReverse}
        title="Estornar pagamento"
        description={
          contaToReverse?.descricao
            ? `Estornar o pagamento da conta "${contaToReverse.descricao}"? O status voltará para aberta e será registrada uma movimentação de estorno.`
            : 'Estornar pagamento?'
        }
        confirmLabel="Estornar"
        defaultContaTipo="pagamentos"
        onConfirm={async ({ contaCorrenteId, dataISO, motivo }) => {
          if (!contaToReverse?.id) return;
          await financeiroService.estornarContaPagar({
            id: contaToReverse.id,
            dataEstorno: dataISO,
            contaCorrenteId,
            motivo,
          });
          addToast('Estorno registrado com sucesso!', 'success');
          refresh();
        }}
      />

      <Modal isOpen={isCancelOpen} onClose={handleCloseCancel} title="Cancelar conta a pagar" size="md">
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">
            Cancelar esta conta a pagar? Esta ação é recomendada apenas para contas <b>abertas/parciais</b>.
            Para contas pagas, use <b>Estorno</b>.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
            <textarea
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-200 bg-white/70 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex.: lançamento duplicado / compra cancelada / ajuste administrativo..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleCloseCancel} disabled={canceling}>
              Voltar
            </Button>
            <Button onClick={handleCancel} disabled={canceling} className="bg-gray-800 hover:bg-gray-900">
              {canceling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cancelar conta
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja excluir a conta "${contaToDelete?.descricao}"?`}
        confirmText="Sim, Excluir"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
};

export default ContasPagarPage;
