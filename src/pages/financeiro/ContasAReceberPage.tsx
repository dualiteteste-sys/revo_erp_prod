import React, { useEffect, useRef, useState } from 'react';
import { useContasAReceber } from '@/hooks/useContasAReceber';
import { useToast } from '@/contexts/ToastProvider';
import * as contasAReceberService from '@/services/contasAReceber';
import { Loader2, PlusCircle, Search, TrendingUp, DatabaseBackup, X } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ListPaginationBar from '@/components/ui/ListPaginationBar';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import ContasAReceberTable from '@/components/financeiro/contas-a-receber/ContasAReceberTable';
import { ContaAReceberMobileCard } from '@/components/financeiro/contas-a-receber/ContaAReceberMobileCard';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import ContasAReceberFormPanel from '@/components/financeiro/contas-a-receber/ContasAReceberFormPanel';
import ContasAReceberSummary from '@/components/financeiro/contas-a-receber/ContasAReceberSummary';
import BaixaRapidaModal from '@/components/financeiro/common/BaixaRapidaModal';
import MotivoModal from '@/components/financeiro/common/MotivoModal';
import EstornoRecebimentoModal from '@/components/financeiro/common/EstornoRecebimentoModal';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'react-router-dom';
import DatePicker from '@/components/ui/DatePicker';
import { isSeedEnabled } from '@/utils/seed';
import { useAuth } from '@/contexts/AuthProvider';
import { useResultSetSelection } from '@/hooks/useResultSetSelection';
import SelectionTotalizerBar from '@/components/financeiro/SelectionTotalizerBar';
import { useFinanceiroSelectionTotals } from '@/hooks/useFinanceiroSelectionTotals';

const ContasAReceberPage: React.FC = () => {
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
  } = useContasAReceber();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<contasAReceberService.ContaAReceber | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [contaToDelete, setContaToDelete] = useState<contasAReceberService.ContaAReceber | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isBaixaOpen, setIsBaixaOpen] = useState(false);
  const [contaToReceive, setContaToReceive] = useState<contasAReceberService.ContaAReceber | null>(null);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [contaToCancel, setContaToCancel] = useState<contasAReceberService.ContaAReceber | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isEstornoOpen, setIsEstornoOpen] = useState(false);
  const [contaToReverse, setContaToReverse] = useState<contasAReceberService.ContaAReceber | null>(null);

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
    setIsFetchingDetails(false);
    setIsBaixaOpen(false);
    setContaToReceive(null);
    setIsCancelOpen(false);
    setContaToCancel(null);
    setIsCanceling(false);
    setIsEstornoOpen(false);
    setContaToReverse(null);

    const contaId = searchParams.get('contaId');
    if (contaId) {
      const next = new URLSearchParams(searchParams);
      next.delete('contaId');
      setSearchParams(next, { replace: true });
    }

    if (prevEmpresaId && activeEmpresaId) {
      addToast('Empresa alterada. Recarregando contas a receber…', 'info');
    }

    lastEmpresaIdRef.current = activeEmpresaId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresaId]);

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
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedConta(null);
      try {
        const details = await contasAReceberService.getContaAReceberDetails(contaId);
        setSelectedConta(details);
      } catch (e: any) {
        addToast(e?.message || 'Erro ao abrir a conta a receber.', 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
        const next = new URLSearchParams(searchParams);
        next.delete('contaId');
        setSearchParams(next, { replace: true });
      }
    })();
  }, [addToast, authLoading, activeEmpresaId, empresaChanged, searchParams, setSearchParams]);

  const handleOpenForm = async (conta: contasAReceberService.ContaAReceber | null = null) => {
    if (conta?.id) {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedConta(null);
      try {
        const details = await contasAReceberService.getContaAReceberDetails(conta.id);
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

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedConta(null);
  };

  const handleSaveSuccess = () => {
    refresh();
    handleCloseForm();
  };

  const handleOpenDeleteModal = (conta: contasAReceberService.ContaAReceber) => {
    setContaToDelete(conta);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setContaToDelete(null);
  };

  const handleDelete = async () => {
    if (!contaToDelete?.id) return;
    setIsDeleting(true);
    try {
      await contasAReceberService.deleteContaAReceber(contaToDelete.id);
      addToast('Conta a receber excluída com sucesso!', 'success');
      refresh();
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReceive = async (conta: contasAReceberService.ContaAReceber) => {
    if (!conta?.id) return;
    try {
      const details = await contasAReceberService.getContaAReceberDetails(conta.id);
      setContaToReceive({ ...conta, ...(details as any) });
    } catch (e: any) {
      addToast(e?.message || 'Não foi possível carregar os detalhes do título.', 'error');
      setContaToReceive(conta);
    }
    setIsBaixaOpen(true);
  };

  const handleCloseBaixa = () => {
    setIsBaixaOpen(false);
    setContaToReceive(null);
  };

  const handleOpenCancel = (conta: contasAReceberService.ContaAReceber) => {
    setContaToCancel(conta);
    setIsCancelOpen(true);
  };

  const handleCloseCancel = () => {
    setIsCancelOpen(false);
    setContaToCancel(null);
  };

  const handleOpenEstorno = (conta: contasAReceberService.ContaAReceber) => {
    setContaToReverse(conta);
    setIsEstornoOpen(true);
  };

  const handleCloseEstorno = () => {
    setIsEstornoOpen(false);
    setContaToReverse(null);
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
      await contasAReceberService.seedContasAReceber();
      addToast('5 Contas a Receber criadas com sucesso!', 'success');
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
  const effectiveCount = empresaChanged ? 0 : count;
  const canShowSummary = !empresaChanged && !!summary;

  const pageIds = React.useMemo(() => effectiveContas.map((c) => c.id), [effectiveContas]);
  const filterSignature = React.useMemo(() => {
    return JSON.stringify({
      q: searchTerm,
      status: filterStatus,
      start: filterStartDate ? filterStartDate.toISOString().slice(0, 10) : null,
      end: filterEndDate ? filterEndDate.toISOString().slice(0, 10) : null,
      sortBy,
    });
  }, [filterEndDate, filterStartDate, filterStatus, searchTerm, sortBy]);

  const selection = useResultSetSelection({
    pageIds,
    totalMatchingCount: effectiveCount,
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
      contasAReceberService.getContasAReceberSelectionTotals({
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
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver contas a receber.</div>;
  }

  return (
    <div className="p-1 min-h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Contas a Receber</h1>
        <div className="flex items-center gap-2">
          {enableSeed ? (
            <Button
              variant="secondary"
              onClick={handleSeed}
              disabled={isSeeding || effectiveLoading}
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

      {canShowSummary ? <ContasAReceberSummary summary={summary} /> : null}

      <div className="mt-6 mb-4 flex flex-wrap gap-4 items-end">
        <div className="relative flex-grow max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por descrição ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-xs p-3 pl-10 border border-gray-300 rounded-lg"
          />
        </div>
        <Select
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value || null)}
          className="min-w-[200px]"
        >
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="parcial">Parcial</option>
          <option value="pago">Pago</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
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
            totalMatchingCount={effectiveCount}
            loading={totalsState.loading}
            totals={[
              { key: 'valor', label: 'Valor', value: totalsState.data?.total_valor ?? null },
              { key: 'recebido', label: 'Recebido', value: totalsState.data?.total_recebido ?? null },
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
          ) : effectiveError ? (
            <div className="h-96 flex items-center justify-center text-red-500">{effectiveError}</div>
          ) : effectiveContas.length === 0 ? (
            <div className="h-96 flex flex-col items-center justify-center text-gray-500">
              <TrendingUp size={48} className="mb-4" />
              <p>Nenhuma conta a receber encontrada.</p>
              {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
            </div>
          ) : (
            <ResponsiveTable
              data={effectiveContas}
              getItemId={(c) => c.id}
              loading={effectiveLoading}
              tableComponent={
                <ContasAReceberTable
                  contas={effectiveContas}
                  onEdit={handleOpenForm}
                  onReceive={handleReceive}
                  onCancel={handleOpenCancel}
                  onReverse={handleOpenEstorno}
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
                <ContaAReceberMobileCard
                  key={conta.id}
                  conta={conta}
                  selected={selection.isSelected(conta.id)}
                  onToggleSelect={selection.toggleOne}
                  onEdit={() => handleOpenForm(conta)}
                  onReceive={() => handleReceive(conta)}
                  onCancel={() => handleOpenCancel(conta)}
                  onReverse={() => handleOpenEstorno(conta)}
                  onDelete={() => handleOpenDeleteModal(conta)}
                />
              )}
            />
          )}
        </div>
      </div>

      {effectiveCount > 0 ? (
        <ListPaginationBar className="mt-4" innerClassName="px-3 sm:px-4">
          <Pagination
            currentPage={page}
            totalCount={effectiveCount}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPage(1);
              setPageSize(next);
            }}
          />
        </ListPaginationBar>
      ) : null}

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedConta ? 'Editar Conta a Receber' : 'Nova Conta a Receber'}>
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[500px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <ContasAReceberFormPanel conta={selectedConta} onSaveSuccess={handleSaveSuccess} onMutate={refresh} onClose={handleCloseForm} />
        )}
      </Modal>

      <BaixaRapidaModal
        isOpen={isBaixaOpen}
        onClose={handleCloseBaixa}
        title="Registrar recebimento"
        description={
          contaToReceive?.descricao
            ? `Confirmar recebimento da conta "${contaToReceive.descricao}".`
            : 'Confirmar recebimento.'
        }
        defaultValor={Math.max(0, Number(contaToReceive?.valor ?? 0) - Number(contaToReceive?.valor_pago ?? 0))}
        confirmLabel="Registrar recebimento"
        onConfirm={async ({ contaCorrenteId, dataISO, valor }) => {
          if (!contaToReceive?.id) return;
          try {
            await contasAReceberService.receberContaAReceber({
              id: contaToReceive.id,
              dataPagamento: dataISO,
              valorPago: valor,
              contaCorrenteId,
            });
            addToast('Recebimento registrado com sucesso!', 'success');
            refresh();
          } catch (e: any) {
            addToast(e?.message || 'Erro ao registrar recebimento.', 'error');
            throw e;
          }
        }}
      />

      <MotivoModal
        isOpen={isCancelOpen}
        onClose={handleCloseCancel}
        title="Cancelar conta a receber"
        description={
          contaToCancel?.descricao
            ? `Cancelar a conta "${contaToCancel.descricao}"? Isso não apaga o registro, apenas marca como cancelado.`
            : 'Cancelar esta conta?'
        }
        confirmLabel="Cancelar"
        isSubmitting={isCanceling}
        onConfirm={async (motivo) => {
          if (!contaToCancel?.id) return;
          setIsCanceling(true);
          try {
            await contasAReceberService.cancelarContaAReceber({ id: contaToCancel.id, motivo });
            addToast('Conta cancelada com sucesso!', 'success');
            refresh();
          } catch (e: any) {
            addToast(e?.message || 'Erro ao cancelar a conta.', 'error');
            throw e;
          } finally {
            setIsCanceling(false);
          }
        }}
      />

      <EstornoRecebimentoModal
        isOpen={isEstornoOpen}
        onClose={handleCloseEstorno}
        title="Estornar recebimento"
        description={
          contaToReverse?.descricao
            ? `Estornar o recebimento da conta "${contaToReverse.descricao}"? A conta voltará para pendente e será registrada uma movimentação de estorno.`
            : 'Estornar recebimento?'
        }
        confirmLabel="Estornar"
        onConfirm={async ({ contaCorrenteId, dataISO, motivo }) => {
          if (!contaToReverse?.id) return;
          try {
            await contasAReceberService.estornarContaAReceber({
              id: contaToReverse.id,
              dataEstorno: dataISO,
              contaCorrenteId,
              motivo,
            });
            addToast('Estorno registrado com sucesso!', 'success');
            refresh();
          } catch (e: any) {
            addToast(e?.message || 'Erro ao estornar.', 'error');
            throw e;
          }
        }}
      />

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

export default ContasAReceberPage;
