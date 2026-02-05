import React, { useEffect, useMemo, useState } from 'react';
import { usePartners } from '../../hooks/usePartners';
import { useToast } from '../../contexts/ToastProvider';
import * as partnersService from '../../services/partners';
import { Loader2, Search, Users2, DatabaseBackup, UsersRound, Plus, FileDown, FileUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Pagination from '../../components/ui/Pagination';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import Modal from '../../components/ui/Modal';
import PartnersTable from '../../components/partners/PartnersTable';
import { PartnerMobileCard } from '../../components/partners/PartnerMobileCard';
import { ResponsiveTable } from '../../components/ui/ResponsiveTable';
import PartnerFormPanel from '../../components/partners/PartnerFormPanel';
import Select from '@/components/ui/forms/Select';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { downloadCsv } from '@/utils/csv';
import { isSeedEnabled } from '@/utils/seed';
import { useHasPermission } from '@/hooks/useHasPermission';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionsBar from '@/components/ui/BulkActionsBar';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import EmptyState from '@/components/ui/EmptyState';
import { uiMessages } from '@/lib/ui/messages';
import ImportPartnersCsvModal from '@/components/partners/ImportPartnersCsvModal';
import { useSearchParams } from 'react-router-dom';

const PartnersPage: React.FC = () => {
  const enableSeed = isSeedEnabled();
  const permCreate = useHasPermission('partners', 'create');
  const permUpdate = useHasPermission('partners', 'update');
  const permDelete = useHasPermission('partners', 'delete');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading || permDelete.isLoading;
  const canCreate = !!permCreate.data;
  const canUpdate = !!permUpdate.data;
  const canDelete = !!permDelete.data;

  const {
    partners,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterType,
    statusFilter,
    sortBy,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterType,
    setStatusFilter,
    setSortBy,
    refresh,
  } = usePartners();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<partnersService.PartnerDetails | null>(null);
  const [initialFormValues, setInitialFormValues] = useState<Partial<partnersService.PartnerDetails> | undefined>(undefined);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<partnersService.PartnerListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const bulk = useBulkSelection(partners, (p) => p.id);
  const selectedPartners = useMemo(
    () => partners.filter((p) => bulk.selectedIds.has(p.id)),
    [partners, bulk.selectedIds]
  );
  const hasSelectedActive = selectedPartners.some((p) => !p.deleted_at);
  const hasSelectedInactive = selectedPartners.some((p) => !!p.deleted_at);

  const handleOpenForm = async (
    partner: partnersService.PartnerListItem | null = null,
    initialValues?: Partial<partnersService.PartnerDetails>
  ) => {
    const needsUpdate = !!partner?.id;
    if (!permsLoading && needsUpdate && !canUpdate) {
      addToast('Você não tem permissão para editar parceiros.', 'warning');
      return;
    }
    if (!permsLoading && !needsUpdate && !canCreate) {
      addToast('Você não tem permissão para criar parceiros.', 'warning');
      return;
    }
    setInitialFormValues(initialValues);
    if (partner?.id) {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedPartner(null);
      try {
        const details = await partnersService.getPartnerDetails(partner.id);
        setSelectedPartner(details);
      } catch (e: any) {
        addToast(e.message, 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
      }
    } else {
      setSelectedPartner(null);
      setIsFormOpen(true);
    }
  };

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;

    void (async () => {
      await handleOpenForm({ id: openId } as any);
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedPartner(null);
    setInitialFormValues(undefined);
  };

  const queryClient = useQueryClient();

  const handleSaveSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['partners'] });
    refresh();
    handleCloseForm();
  };

  const handleOpenDeleteModal = (partner: partnersService.PartnerListItem) => {
    if (!permsLoading && !canDelete) {
      addToast('Você não tem permissão para inativar parceiros.', 'warning');
      return;
    }
    setPartnerToDelete(partner);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setPartnerToDelete(null);
  };

  const handleDelete = async () => {
    if (!partnerToDelete?.id) return;
    if (!permsLoading && !canDelete) {
      addToast('Você não tem permissão para inativar parceiros.', 'warning');
      return;
    }
    setIsDeleting(true);
    try {
      await partnersService.deletePartner(partnerToDelete.id);
      addToast('Registro inativado com sucesso!', 'success');
      refresh();
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async (partner: partnersService.PartnerListItem) => {
    if (!permsLoading && !canUpdate) {
      addToast('Você não tem permissão para reativar parceiros.', 'warning');
      return;
    }
    try {
      await partnersService.restorePartner(partner.id);
      addToast('Registro reativado com sucesso!', 'success');
      refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao reativar.', 'error');
    }
  };

  const handleBulkInativar = async () => {
    if (!selectedPartners.length) return;
    if (!permsLoading && !canDelete) {
      addToast('Você não tem permissão para inativar parceiros.', 'warning');
      return;
    }

    setBulkLoading(true);
    try {
      const actives = selectedPartners.filter((p) => !p.deleted_at);
      const results = await Promise.allSettled(actives.map((p) => partnersService.deletePartner(p.id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (ok) addToast(`${ok} parceiro(s) inativado(s).`, 'success');
      if (fail) addToast(`${fail} falha(s) ao inativar.`, 'warning');
      bulk.clear();
      refresh();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao inativar selecionados.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkReativar = async () => {
    if (!selectedPartners.length) return;
    if (!permsLoading && !canUpdate) {
      addToast('Você não tem permissão para reativar parceiros.', 'warning');
      return;
    }

    setBulkLoading(true);
    try {
      const inactives = selectedPartners.filter((p) => !!p.deleted_at);
      const results = await Promise.allSettled(inactives.map((p) => partnersService.restorePartner(p.id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (ok) addToast(`${ok} parceiro(s) reativado(s).`, 'success');
      if (fail) addToast(`${fail} falha(s) ao reativar.`, 'warning');
      bulk.clear();
      refresh();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao reativar selecionados.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSort = (column: keyof partnersService.PartnerListItem) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };

  const handleSeedPartners = async () => {
    if (!permsLoading && !canCreate) {
      addToast('Você não tem permissão para popular dados.', 'warning');
      return;
    }
    setIsSeeding(true);
    try {
      const seededPartners = await partnersService.seedDefaultPartners();
      addToast(`${seededPartners.length} parceiros padrão foram adicionados!`, 'success');
      refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular parceiros.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const headerActions = useMemo(() => {
    return (
      <>
        <Button
          onClick={() => {
            downloadCsv({
              filename: 'clientes-fornecedores.csv',
              headers: ['Nome', 'Tipo', 'Documento', 'Email', 'Telefone', 'Status'],
              rows: partners.map((p: any) => [
                p.nome || '',
                p.tipo || '',
                p.documento || p.cnpj || p.cpf || '',
                p.email || '',
                p.telefone || '',
                p.ativo === false ? 'Inativo' : 'Ativo',
              ]),
            });
          }}
          disabled={loading || partners.length === 0}
          variant="secondary"
          title="Exportar a lista atual"
          className="gap-2"
        >
          <FileDown size={18} />
          Exportar CSV
        </Button>

        <Button
          onClick={() => setIsImportOpen(true)}
          variant="secondary"
          className="gap-2"
          disabled={permsLoading || !canCreate}
          title={!canCreate ? 'Sem permissão para importar' : 'Importar clientes/fornecedores por CSV/XLSX'}
        >
          <FileUp size={18} />
          Importar CSV/XLSX
        </Button>

        {enableSeed ? (
          <Button
            onClick={handleSeedPartners}
            disabled={isSeeding || loading || permsLoading || !canCreate}
            title={!canCreate ? 'Sem permissão para popular dados' : undefined}
            variant="secondary"
            className="gap-2"
          >
            {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
            Popular dados
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2" disabled={permsLoading || !canCreate} title={!canCreate ? 'Sem permissão para criar' : undefined}>
              <Plus size={18} />
              Novo
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleOpenForm(null, { tipo: 'cliente' })}>
              Novo cliente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOpenForm(null, { tipo: 'fornecedor' })}>
              Novo fornecedor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOpenForm(null, { tipo: 'ambos' })}>
              Cliente e fornecedor
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  }, [enableSeed, handleSeedPartners, handleOpenForm, isSeeding, loading, partners, permsLoading, canCreate]);

  const formTitle = useMemo(() => {
    if (selectedPartner) return 'Editar Cliente/Fornecedor';
    if (initialFormValues?.tipo === 'fornecedor') return 'Novo Fornecedor';
    if (initialFormValues?.tipo === 'ambos') return 'Novo Cliente/Fornecedor';
    return 'Novo Cliente';
  }, [initialFormValues?.tipo, selectedPartner]);

  const header = (
    <PageHeader
      title="Clientes e Fornecedores"
      description="Cadastre e gerencie clientes, fornecedores e perfis que são ambos."
      icon={<UsersRound size={20} />}
      actions={headerActions}
    />
  );

  const filters = (
    <div className="flex gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nome, doc ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-xs p-3 pl-10 border border-gray-300 rounded-lg"
        />
      </div>
      <Select
        value={filterType || ''}
        onChange={(e) => setFilterType(e.target.value || null)}
        className="min-w-[200px]"
      >
        <option value="">Todos os tipos</option>
        <option value="cliente">Cliente</option>
        <option value="fornecedor">Fornecedor</option>
        <option value="ambos">Ambos</option>
      </Select>
      <Select
        value={statusFilter || 'active'}
        onChange={(e) => setStatusFilter((e.target.value as any) || 'active')}
        className="min-w-[220px]"
      >
        <option value="active">Apenas ativos</option>
        <option value="inactive">Apenas inativos</option>
        <option value="all">Ativos e inativos</option>
      </Select>
    </div>
  );

  const footer = count > 0 ? (
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
  ) : null;

  return (
    <PageShell header={header} filters={filters} footer={footer}>
      <PageCard className="flex flex-col flex-1 min-h-0">
        {loading && partners.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : partners.length === 0 ? (
          <EmptyState
            icon={<Users2 size={48} />}
            title="Nenhum cliente ou fornecedor encontrado"
            description={`Comece cadastrando um novo parceiro${enableSeed ? ' ou popule com dados de exemplo.' : '.'}`}
            hint={searchTerm ? uiMessages.empty.tryAdjustFilters : undefined}
            actions={
              enableSeed ? (
                <Button onClick={handleSeedPartners} disabled={isSeeding} variant="secondary" className="gap-2">
                  {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
                  Popular com dados de exemplo
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <BulkActionsBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              actions={[
                {
                  key: 'inativar',
                  label: 'Inativar',
                  onClick: handleBulkInativar,
                  variant: 'secondary',
                  disabled: bulkLoading || permsLoading || !canDelete || !hasSelectedActive,
                },
                {
                  key: 'reativar',
                  label: 'Reativar',
                  onClick: handleBulkReativar,
                  variant: 'secondary',
                  disabled: bulkLoading || permsLoading || !canUpdate || !hasSelectedInactive,
                },
              ]}
            />
            <div className="flex-1 min-h-0 overflow-auto">
              <ResponsiveTable
                data={partners}
                getItemId={(p) => p.id}
                loading={loading}
                tableComponent={
                  <PartnersTable
                    partners={partners}
                    onEdit={handleOpenForm}
                    onDelete={handleOpenDeleteModal}
                    onRestore={handleRestore}
                    sortBy={sortBy}
                    onSort={handleSort}
                    selectedIds={bulk.selectedIds}
                    allSelected={bulk.allSelected}
                    someSelected={bulk.someSelected}
                    onToggleSelect={(id) => bulk.toggle(id)}
                    onToggleSelectAll={() => bulk.toggleAll(bulk.allIds)}
                  />
                }
                renderMobileCard={(partner) => (
                  <PartnerMobileCard
                    key={partner.id}
                    partner={partner}
                    onEdit={() => handleOpenForm(partner)}
                    onDelete={() => handleOpenDeleteModal(partner)}
                    onRestore={() => handleRestore(partner)}
                    selected={bulk.selectedIds.has(partner.id)}
                    onToggleSelect={(id) => bulk.toggle(id)}
                  />
                )}
              />
            </div>
          </>
        )}
      </PageCard>

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={formTitle}>
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[500px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <PartnerFormPanel
            partner={selectedPartner}
            initialValues={initialFormValues}
            onSaveSuccess={handleSaveSuccess}
            onClose={handleCloseForm}
          />
        )}
      </Modal>

      <ImportPartnersCsvModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        importFn={(payload) => partnersService.savePartner(payload)}
        deleteFn={(id) => partnersService.deletePartner(id)}
        onImported={() => {
          setIsImportOpen(false);
          refresh();
        }}
      />

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        title="Confirmar Inativação"
        description={`Tem certeza que deseja inativar "${partnerToDelete?.nome}"? Você pode reativar depois, se necessário.`}
        confirmText="Sim, Inativar"
        isLoading={isDeleting}
        variant="danger"
      />
    </PageShell>
  );
};

export default PartnersPage;
