import React, { useMemo, useState } from 'react';
import { usePartners } from '../../hooks/usePartners';
import { useToast } from '../../contexts/ToastProvider';
import * as partnersService from '../../services/partners';
import { Loader2, Search, Users2, DatabaseBackup, UsersRound, Plus, FileDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Pagination from '../../components/ui/Pagination';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import Modal from '../../components/ui/Modal';
import PartnersTable from '../../components/partners/PartnersTable';
import PartnerFormPanel from '../../components/partners/PartnerFormPanel';
import Select from '@/components/ui/forms/Select';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { downloadCsv } from '@/utils/csv';
import { isSeedEnabled } from '@/utils/seed';

const PartnersPage: React.FC = () => {
  const enableSeed = isSeedEnabled();

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

  const handleOpenForm = async (
    partner: partnersService.PartnerListItem | null = null,
    initialValues?: Partial<partnersService.PartnerDetails>
  ) => {
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
    setPartnerToDelete(partner);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setPartnerToDelete(null);
  };

  const handleDelete = async () => {
    if (!partnerToDelete?.id) return;
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
    try {
      await partnersService.restorePartner(partner.id);
      addToast('Registro reativado com sucesso!', 'success');
      refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao reativar.', 'error');
    }
  };

  const handleSort = (column: keyof partnersService.PartnerListItem) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };

  const handleSeedPartners = async () => {
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

        {enableSeed ? (
          <Button onClick={handleSeedPartners} disabled={isSeeding || loading} variant="secondary" className="gap-2">
            {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
            Popular dados
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
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
  }, [enableSeed, handleSeedPartners, handleOpenForm, isSeeding, loading, partners]);

  const formTitle = useMemo(() => {
    if (selectedPartner) return 'Editar Cliente/Fornecedor';
    if (initialFormValues?.tipo === 'fornecedor') return 'Novo Fornecedor';
    if (initialFormValues?.tipo === 'ambos') return 'Novo Cliente/Fornecedor';
    return 'Novo Cliente';
  }, [initialFormValues?.tipo, selectedPartner]);

  return (
    <div className="p-1">
      <div className="mb-6">
        <PageHeader
          title="Clientes e Fornecedores"
          description="Cadastre e gerencie clientes, fornecedores e perfis que são ambos."
          icon={<UsersRound size={20} />}
          actions={headerActions}
        />
      </div>

      <div className="mb-4 flex gap-4">
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

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && partners.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : partners.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-center text-gray-500 p-4">
            <Users2 size={48} className="mb-4" />
            <p className="font-semibold text-lg">Nenhum cliente ou fornecedor encontrado.</p>
            <p className="text-sm mb-4">
              Comece cadastrando um novo parceiro{enableSeed ? ' ou popule com dados de exemplo.' : '.'}
            </p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
            {enableSeed ? (
              <Button onClick={handleSeedPartners} disabled={isSeeding} variant="secondary" className="mt-4 gap-2">
                {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
                Popular com dados de exemplo
              </Button>
            ) : null}
          </div>
        ) : (
          <PartnersTable
            partners={partners}
            onEdit={handleOpenForm}
            onDelete={handleOpenDeleteModal}
            onRestore={handleRestore}
            sortBy={sortBy}
            onSort={handleSort}
          />
        )}
      </div>

      {count > pageSize && (
        <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
      )}

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
    </div>
  );
};

export default PartnersPage;
