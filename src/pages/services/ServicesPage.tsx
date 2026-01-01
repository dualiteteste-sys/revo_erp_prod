import React, { useMemo, useState } from 'react';
import { useServices } from '@/hooks/useServices';
import * as svc from '@/services/services';
import ServicesTable from '@/components/services/ServicesTable';
import ServiceFormPanel from '@/components/services/ServiceFormPanel';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2, Search, Wrench, DatabaseBackup, Plus } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { isSeedEnabled } from '@/utils/seed';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionsBar from '@/components/ui/BulkActionsBar';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';

export default function ServicesPage() {
  const enableSeed = isSeedEnabled();
  const {
    services,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    statusFilter,
    sortBy,
    setPage,
    setSearchTerm,
    setStatusFilter,
    setSortBy,
    refresh,
  } = useServices();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selected, setSelected] = useState<svc.Service | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<svc.Service | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const { addToast } = useToast();

  const bulk = useBulkSelection(services, (s) => s.id);
  const selectedServices = useMemo(
    () => services.filter((s) => bulk.selectedIds.has(s.id)),
    [services, bulk.selectedIds]
  );

  const handleOpenForm = async (service: svc.Service | null = null) => {
    if (service?.id) {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelected(null);
      try {
        const details = await svc.getService(service.id);
        setSelected(details);
      } catch (e: any) {
        addToast(e.message, 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
      }
    } else {
      setSelected(null);
      setIsFormOpen(true);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelected(null);
  };

  const handleSaveSuccess = () => {
    refresh();
    handleCloseForm();
  };

  function openDeleteModal(s: svc.Service) {
    setServiceToDelete(s);
    setIsDeleteModalOpen(true);
  }

  async function handleDelete() {
    if (!serviceToDelete) return;
    setIsDeleting(true);
    try {
        await svc.deleteService(serviceToDelete.id);
        addToast('Serviço removido', 'success');
        refresh();
        setIsDeleteModalOpen(false);
    } catch(e: any) {
        addToast(e.message || 'Erro ao remover serviço.', 'error');
    } finally {
        setIsDeleting(false);
    }
  }

  async function handleBulkDelete() {
    if (!selectedServices.length) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(selectedServices.map((s) => svc.deleteService(s.id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (ok) addToast(`${ok} serviço(s) removido(s).`, 'success');
      if (fail) addToast(`${fail} falha(s) ao remover.`, 'warning');
      bulk.clear();
      setBulkDeleteOpen(false);
      refresh();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao remover selecionados.', 'error');
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleClone(s: svc.Service) {
    try {
      addToast('Clonando serviço...', 'info');
      const clone = await svc.cloneService(s.id);
      addToast('Serviço clonado!');
      refresh();
      handleOpenForm(clone);
    } catch (e: any) {
      addToast(e.message || 'Erro ao clonar serviço', 'error');
    }
  }

  const handleSort = (column: keyof svc.Service) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };

  const handleSeedServices = async () => {
    setIsSeeding(true);
    try {
      const seededServices = await svc.seedDefaultServices();
      addToast(`${seededServices.length} serviços padrão foram adicionados!`, 'success');
      refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular serviços.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const totals = useMemo(() => {
    const total = services.length;
    const ativos = services.filter(s => s.status === 'ativo').length;
    const inativos = services.filter(s => s.status === 'inativo').length;
    return { total, ativos, inativos };
  }, [services]);

  const header = (
    <PageHeader
      title="Serviços"
      description="Catálogo de serviços para propostas, pedidos e ordens de serviço."
      icon={<Wrench size={20} />}
      actions={
        <>
          <CsvExportDialog
            filename="servicos.csv"
            rows={services}
            disabled={loading}
            columns={[
              { key: 'descricao', label: 'Descrição', getValue: (r) => r.descricao },
              { key: 'codigo', label: 'Código', getValue: (r) => r.codigo ?? '' },
              { key: 'preco', label: 'Preço de venda', getValue: (r) => r.preco_venda ?? '' },
              { key: 'unidade', label: 'Unidade', getValue: (r) => r.unidade ?? '' },
              { key: 'status', label: 'Status', getValue: (r) => r.status },
              { key: 'codigo_servico', label: 'Código serviço', getValue: (r) => r.codigo_servico ?? '' },
              { key: 'nbs', label: 'NBS', getValue: (r) => r.nbs ?? '' },
              { key: 'nbs_req', label: 'NBS/IBPT obrigatório', getValue: (r) => (r.nbs_ibpt_required ? 'Sim' : 'Não') },
            ]}
          />
          {enableSeed ? (
            <Button onClick={handleSeedServices} disabled={isSeeding || loading} variant="secondary" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
              Popular dados
            </Button>
          ) : null}
          <Button onClick={() => handleOpenForm()}>
            <Plus size={18} />
            <span className="ml-2">Novo serviço</span>
          </Button>
        </>
      }
    />
  );

  const summary = (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <p className="text-xs text-indigo-700 font-semibold">Serviços (página atual)</p>
        <p className="text-2xl font-bold text-indigo-800">{totals.total}</p>
      </div>
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
        <p className="text-xs text-emerald-700 font-semibold">Ativos</p>
        <p className="text-2xl font-bold text-emerald-800">{totals.ativos}</p>
      </div>
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
        <p className="text-xs text-slate-700 font-semibold">Inativos</p>
        <p className="text-2xl font-bold text-slate-800">{totals.inativos}</p>
      </div>
    </div>
  );

  const filters = (
    <div className="flex gap-4">
      <div className="relative flex-grow max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por descrição ou código..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <Select
        value={statusFilter || ''}
        onChange={(e) => setStatusFilter((e.target.value as any) || null)}
        className="min-w-[220px]"
      >
        <option value="">Todos os status</option>
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </Select>
    </div>
  );

  const footer = count > pageSize ? (
    <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
  ) : null;

  return (
    <PageShell header={header} summary={summary} filters={filters} footer={footer}>
      <PageCard>
        {loading && services.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : services.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-center text-gray-500 p-4">
            <Wrench size={48} className="mb-4" />
            <p className="font-semibold text-lg">Nenhum serviço encontrado.</p>
            <p className="text-sm mb-4">
              Comece cadastrando um novo serviço{enableSeed ? ' ou popule com dados de exemplo.' : '.'}
            </p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
            {enableSeed ? (
              <Button onClick={handleSeedServices} disabled={isSeeding} variant="secondary" className="mt-4 gap-2">
                {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
                Popular com dados de exemplo
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <BulkActionsBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              actions={[
                {
                  key: 'delete',
                  label: 'Remover',
                  onClick: () => setBulkDeleteOpen(true),
                  variant: 'destructive',
                  disabled: bulkLoading,
                },
              ]}
            />
            <ServicesTable
              services={services}
              onEdit={handleOpenForm}
              onDelete={openDeleteModal}
              onClone={handleClone}
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
      </PageCard>

      <Modal
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        title={selected ? 'Editar Serviço' : 'Novo Serviço'}
      >
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <ServiceFormPanel
            service={selected}
            onSaveSuccess={handleSaveSuccess}
            onClose={handleCloseForm}
          />
        )}
      </Modal>
      
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja remover o serviço "${serviceToDelete?.descricao}"?`}
        confirmText="Sim, Remover"
        isLoading={isDeleting}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Confirmar Remoção em Massa"
        description={`Tem certeza que deseja remover ${selectedServices.length} serviço(s)? Esta ação não pode ser desfeita.`}
        confirmText="Sim, Remover"
        isLoading={bulkLoading}
        variant="danger"
      />
    </PageShell>
  );
}
