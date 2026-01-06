import React, { useMemo, useState } from 'react';
import { useCarriers } from '../../hooks/useCarriers';
import { useToast } from '../../contexts/ToastProvider';
import * as carriersService from '../../services/carriers';
import { FileUp, Loader2, PlusCircle, Search, Truck, DatabaseBackup } from 'lucide-react';
import Pagination from '../../components/ui/Pagination';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import Modal from '../../components/ui/Modal';
import CarriersTable from '../../components/carriers/CarriersTable';
import CarrierFormPanel from '../../components/carriers/CarrierFormPanel';
import Select from '@/components/ui/forms/Select';
import { isSeedEnabled } from '@/utils/seed';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionsBar from '@/components/ui/BulkActionsBar';
import { useHasPermission } from '@/hooks/useHasPermission';
import ImportCarriersCsvModal from '@/components/carriers/ImportCarriersCsvModal';

const CarriersPage: React.FC = () => {
  const enableSeed = isSeedEnabled();
  const permCreate = useHasPermission('logistica', 'create');
  const permsLoading = permCreate.isLoading;
  const canCreate = !!permCreate.data;
  const {
    carriers,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    sortBy,
    setPage,
    setSearchTerm,
    setFilterStatus,
    setSortBy,
    refresh,
  } = useCarriers();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<carriersService.CarrierPayload | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [carrierToDelete, setCarrierToDelete] = useState<carriersService.CarrierListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const bulk = useBulkSelection(carriers, (c) => c.id);
  const selectedCarriers = useMemo(
    () => carriers.filter((c) => bulk.selectedIds.has(c.id)),
    [carriers, bulk.selectedIds]
  );

  const handleOpenForm = async (carrier: carriersService.CarrierListItem | null = null) => {
    if (carrier?.id) {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedCarrier(null);
      try {
        const details = await carriersService.getCarrierDetails(carrier.id);
        setSelectedCarrier(details);
      } catch (e: any) {
        addToast(e.message, 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
      }
    } else {
      setSelectedCarrier(null);
      setIsFormOpen(true);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedCarrier(null);
  };

  const handleSaveSuccess = () => {
    refresh();
    handleCloseForm();
  };

  const handleOpenDeleteModal = (carrier: carriersService.CarrierListItem) => {
    setCarrierToDelete(carrier);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setCarrierToDelete(null);
  };

  const handleDelete = async () => {
    if (!carrierToDelete?.id) return;
    setIsDeleting(true);
    try {
      await carriersService.deleteCarrier(carrierToDelete.id);
      addToast('Transportadora excluída com sucesso!', 'success');
      refresh();
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedCarriers.length) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(selectedCarriers.map((c) => carriersService.deleteCarrier(c.id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (ok) addToast(`${ok} transportadora(s) excluída(s).`, 'success');
      if (fail) addToast(`${fail} falha(s) ao excluir.`, 'warning');
      bulk.clear();
      setBulkDeleteOpen(false);
      refresh();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir selecionados.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSort = (column: keyof carriersService.CarrierListItem) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await carriersService.seedCarriers();
      addToast('5 Transportadoras criadas com sucesso!', 'success');
      refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-3xl font-bold text-gray-800">Transportadoras</h1>
            <p className="text-gray-600 text-sm mt-1">Gerencie as empresas responsáveis pelo transporte de suas mercadorias.</p>
        </div>
        <div className="flex items-center gap-2">
            <CsvExportDialog
              filename="transportadoras.csv"
              rows={carriers}
              disabled={loading}
              columns={[
                { key: 'nome', label: 'Nome', getValue: (r) => r.nome },
                { key: 'codigo', label: 'Código', getValue: (r) => r.codigo ?? '' },
                { key: 'documento', label: 'Documento', getValue: (r) => r.documento ?? '' },
                { key: 'cidade', label: 'Cidade', getValue: (r) => r.cidade ?? '' },
                { key: 'uf', label: 'UF', getValue: (r) => r.uf ?? '' },
                { key: 'modal', label: 'Modal', getValue: (r) => r.modal_principal ?? '' },
                { key: 'frete_tipo', label: 'Frete padrão', getValue: (r) => r.frete_tipo_padrao ?? '' },
                { key: 'prazo', label: 'Prazo médio (dias)', getValue: (r) => r.prazo_medio_dias ?? '' },
                { key: 'status', label: 'Status', getValue: (r) => (r.ativo ? 'Ativa' : 'Inativa') },
                { key: 'padrao', label: 'Padrão para frete', getValue: (r) => (r.padrao_para_frete ? 'Sim' : 'Não') },
              ]}
            />
            <button
              onClick={() => setIsImportOpen(true)}
              disabled={permsLoading || !canCreate}
              title={!canCreate ? 'Sem permissão para importar' : 'Importar transportadoras por CSV'}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <FileUp size={20} />
              Importar CSV
            </button>
            {enableSeed ? (
              <button
                onClick={handleSeed}
                disabled={isSeeding || loading}
                className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
                Popular Dados
              </button>
            ) : null}
            <button
              onClick={() => handleOpenForm()}
              disabled={permsLoading || !canCreate}
              title={!canCreate ? 'Sem permissão para criar' : undefined}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <PlusCircle size={20} />
              Nova Transportadora
            </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
        </div>
        <Select
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value || null)}
          className="min-w-[200px]"
        >
          <option value="">Todos os status</option>
          <option value="ativa">Ativa</option>
          <option value="inativa">Inativa</option>
        </Select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading && carriers.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex flex-col items-center justify-center text-red-500 p-4">
            <p className="font-semibold">Erro ao carregar dados</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : carriers.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500 p-4">
            <div className="bg-gray-100 p-4 rounded-full mb-4">
                <Truck size={48} className="text-gray-400" />
            </div>
            <p className="font-semibold text-lg text-gray-700">Nenhuma transportadora encontrada.</p>
            <p className="text-sm mb-6">
              Comece cadastrando uma nova transportadora{enableSeed ? ' ou popule com dados de exemplo.' : '.'}
            </p>
            <div className="flex gap-3">
                {enableSeed ? (
                  <button
                      onClick={handleSeed}
                      disabled={isSeeding}
                      className="flex items-center gap-2 bg-blue-100 text-blue-700 font-bold py-2 px-4 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
                  >
                      {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
                      Popular Dados
                  </button>
                ) : null}
                <button
                    onClick={() => handleOpenForm()}
                    disabled={permsLoading || !canCreate}
                    title={!canCreate ? 'Sem permissão para criar' : undefined}
                    className="text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center disabled:opacity-50"
                >
                    Cadastrar manualmente
                </button>
            </div>
          </div>
        ) : (
          <>
            <BulkActionsBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              actions={[
                {
                  key: 'delete',
                  label: 'Excluir',
                  onClick: () => setBulkDeleteOpen(true),
                  variant: 'destructive',
                  disabled: bulkLoading,
                },
              ]}
            />
            <CarriersTable
              carriers={carriers}
              onEdit={handleOpenForm}
              onDelete={handleOpenDeleteModal}
              sortBy={sortBy}
              onSort={handleSort}
              selectedIds={bulk.selectedIds}
              allSelected={bulk.allSelected}
              someSelected={bulk.someSelected}
              onToggleSelect={(id) => bulk.toggle(id)}
              onToggleSelectAll={() => bulk.toggleAll(bulk.allIds)}
            />
          </>
        )}
      </div>

      {count > pageSize && (
        <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
      )}

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedCarrier ? 'Editar Transportadora' : 'Nova Transportadora'} size="lg">
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <CarrierFormPanel carrier={selectedCarrier} onSaveSuccess={handleSaveSuccess} onClose={handleCloseForm} />
        )}
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja excluir a transportadora "${carrierToDelete?.nome}"? Esta ação não pode ser desfeita.`}
        confirmText="Sim, Excluir"
        isLoading={isDeleting}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Confirmar Exclusão em Massa"
        description={`Tem certeza que deseja excluir ${selectedCarriers.length} transportadora(s)? Esta ação não pode ser desfeita.`}
        confirmText="Sim, Excluir"
        isLoading={bulkLoading}
        variant="danger"
      />

      <ImportCarriersCsvModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        importFn={(payload) => carriersService.saveCarrier(payload)}
        deleteFn={(id) => carriersService.deleteCarrier(id)}
        onImported={() => {
          setIsImportOpen(false);
          refresh();
        }}
      />
    </div>
  );
};

export default CarriersPage;
