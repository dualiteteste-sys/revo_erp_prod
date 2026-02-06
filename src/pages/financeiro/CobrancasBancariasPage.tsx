import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCobrancas } from '@/hooks/useCobrancas';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import * as cobrancasService from '@/services/cobrancas';
import { Loader2, PlusCircle, Search, Landmark, DatabaseBackup, X } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ListPaginationBar from '@/components/ui/ListPaginationBar';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import CobrancasTable from '@/components/financeiro/cobrancas/CobrancasTable';
import { CobrancaMobileCard } from '@/components/financeiro/cobrancas/CobrancaMobileCard';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import CobrancaFormPanel from '@/components/financeiro/cobrancas/CobrancaFormPanel';
import CobrancasSummary from '@/components/financeiro/cobrancas/CobrancasSummary';
import Select from '@/components/ui/forms/Select';
import DatePicker from '@/components/ui/DatePicker';
import { Button } from '@/components/ui/button';
import { isSeedEnabled } from '@/utils/seed';
import { useSearchParams } from 'react-router-dom';
import { useEditLock } from '@/components/ui/hooks/useEditLock';
import { useAuth } from '@/contexts/AuthProvider';

export default function CobrancasBancariasPage() {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const enableSeed = isSeedEnabled();
  const {
    cobrancas,
    summary,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    startVenc,
    endVenc,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterStatus,
    setStartVenc,
    setEndVenc,
    refresh,
  } = useCobrancas();
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const editLock = useEditLock('financeiro:cobrancas');

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCobranca, setSelectedCobranca] = useState<cobrancasService.CobrancaBancaria | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [cobrancaToDelete, setCobrancaToDelete] = useState<cobrancasService.CobrancaBancaria | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;

    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setIsFormOpen(false);
    setSelectedCobranca(null);
    setIsDeleteModalOpen(false);
    setCobrancaToDelete(null);
    setIsDeleting(false);
    setIsSeeding(false);
    if (editingId) editLock.release(editingId);
    setEditingId(null);

    const open = searchParams.get('open');
    if (open) {
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }

    if (prevEmpresaId && activeEmpresaId) {
      addToast('Empresa alterada. Recarregando cobranças…', 'info');
    }

    lastEmpresaIdRef.current = activeEmpresaId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresaId]);

  const clearOpenParam = useCallback(() => {
    if (!openId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [openId, searchParams, setSearchParams]);

  const openWithLock = useCallback(async (id: string) => {
    const claimed = await editLock.claim(id, {
      confirmConflict: async () =>
        confirm({
          title: 'Esta cobrança já está aberta em outra aba',
          description: 'Para evitar edição concorrente, abra em apenas uma aba. Deseja abrir mesmo assim nesta aba?',
          confirmText: 'Abrir mesmo assim',
          cancelText: 'Cancelar',
          variant: 'danger',
        }),
    });
    if (!claimed) {
      clearOpenParam();
      return false;
    }
    setEditingId(id);
    return true;
  }, [clearOpenParam, confirm, editLock]);

  const handleOpenForm = async (cobranca: cobrancasService.CobrancaBancaria | null = null) => {
    if (cobranca?.id) {
      const ok = await openWithLock(cobranca.id);
      if (!ok) return;
    }
    setSelectedCobranca(cobranca);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedCobranca(null);
    clearOpenParam();
    if (editingId) editLock.release(editingId);
    setEditingId(null);
  };

  const handleSaveSuccess = () => {
    refresh();
    handleCloseForm();
  };

  const handleOpenDeleteModal = (cobranca: cobrancasService.CobrancaBancaria) => {
    setCobrancaToDelete(cobranca);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setCobrancaToDelete(null);
  };

  const handleDelete = async () => {
    if (!cobrancaToDelete?.id) return;
    setIsDeleting(true);
    try {
      await cobrancasService.deleteCobranca(cobrancaToDelete.id);
      addToast('Cobrança excluída com sucesso!', 'success');
      refresh();
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await cobrancasService.seedCobrancas();
      addToast('5 Cobranças criadas com sucesso!', 'success');
      refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const clearDateFilters = () => {
    setStartVenc(null);
    setEndVenc(null);
  };

  useEffect(() => {
    if (!openId) return;
    if (isFormOpen) return;
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    void (async () => {
      const ok = await openWithLock(openId);
      if (!ok) return;
      setSelectedCobranca({ id: openId } as any);
      setIsFormOpen(true);
    })();
  }, [activeEmpresaId, authLoading, empresaChanged, isFormOpen, openId, openWithLock]);

  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);
  const effectiveError = empresaChanged ? null : error;
  const effectiveCobrancas = empresaChanged ? [] : cobrancas;
  const effectiveCount = empresaChanged ? 0 : count;
  const canShowSummary = !empresaChanged && !!summary;

  if (authLoading) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  if (!activeEmpresaId) {
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver cobranças bancárias.</div>;
  }

  return (
    <div className="p-1 min-h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Landmark className="text-blue-600" /> Cobranças Bancárias
          </h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de boletos, Pix e links de pagamento.</p>
        </div>
        <div className="flex items-center gap-2">
          {enableSeed ? (
            <Button onClick={handleSeed} disabled={isSeeding || loading} variant="outline" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
              Popular Dados
            </Button>
          ) : null}
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <PlusCircle size={20} />
            Nova Cobrança
          </Button>
        </div>
      </div>

      {canShowSummary ? <CobrancasSummary summary={summary} /> : null}

      <div className="mt-6 mb-4 flex flex-wrap gap-4 items-end">
        <div className="relative flex-grow max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por cliente, doc ou nosso número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <Select
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value as any || null)}
          className="min-w-[180px]"
        >
          <option value="">Todos os status</option>
          <option value="pendente_emissao">Pendente</option>
          <option value="emitida">Emitida</option>
          <option value="registrada">Registrada</option>
          <option value="liquidada">Liquidada</option>
          <option value="erro">Com Erro</option>
        </Select>

        <div className="flex items-center gap-3">
          <DatePicker
            label=""
            value={startVenc}
            onChange={setStartVenc}
            className="w-[200px]"
          />
          <span className="text-gray-500 whitespace-nowrap px-1">até</span>
          <DatePicker
            label=""
            value={endVenc}
            onChange={setEndVenc}
            className="w-[200px]"
          />
          {(startVenc || endVenc) && (
            <Button
              onClick={clearDateFilters}
              variant="ghost"
              size="icon"
              title="Limpar datas"
              className="text-muted-foreground hover:text-destructive"
            >
              <X size={18} />
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-auto">
          {effectiveLoading && effectiveCobrancas.length === 0 ? (
            <div className="h-96 flex items-center justify-center">
              <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
          ) : effectiveError ? (
            <div className="h-96 flex items-center justify-center text-red-500">{effectiveError}</div>
          ) : effectiveCobrancas.length === 0 ? (
            <div className="h-96 flex flex-col items-center justify-center text-gray-500">
              <Landmark size={48} className="mb-4 opacity-20" />
              <p>Nenhuma cobrança encontrada.</p>
              {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
            </div>
          ) : (
            <ResponsiveTable
              data={effectiveCobrancas}
              getItemId={(c) => c.id}
              loading={effectiveLoading}
              tableComponent={
                <CobrancasTable
                  cobrancas={effectiveCobrancas}
                  onEdit={handleOpenForm}
                  onDelete={handleOpenDeleteModal}
                />
              }
              renderMobileCard={(cobranca) => (
                <CobrancaMobileCard
                  key={cobranca.id}
                  cobranca={cobranca}
                  onEdit={() => handleOpenForm(cobranca)}
                  onDelete={() => handleOpenDeleteModal(cobranca)}
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

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedCobranca ? 'Editar Cobrança' : 'Nova Cobrança'} size="4xl">
        <CobrancaFormPanel cobranca={selectedCobranca} onSaveSuccess={handleSaveSuccess} onClose={handleCloseForm} />
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja excluir a cobrança "${cobrancaToDelete?.documento_ref || 'S/N'}"?`}
        confirmText="Sim, Excluir"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
}
