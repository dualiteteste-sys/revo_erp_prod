import React, { useState } from 'react';
import { useServices } from '@/hooks/useServices';
import * as svc from '@/services/services';
import ServicesTable from '@/components/services/ServicesTable';
import ServiceFormPanel from '@/components/services/ServiceFormPanel';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2, PlusCircle, Search, Wrench, DatabaseBackup } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';

export default function ServicesPage() {
  const {
    services,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    sortBy,
    setPage,
    setSearchTerm,
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
  const { addToast } = useToast();

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

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Serviços</h1>
        <div className="flex items-center gap-2">
            <button
              onClick={handleSeedServices}
              disabled={isSeeding || loading}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
              Popular Dados
            </button>
            <button
              onClick={() => handleOpenForm()}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle size={20} />
              Novo Serviço
            </button>
        </div>
      </div>

      <div className="mb-4 flex gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por descrição ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-sm p-2 pl-10 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
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
            <p className="text-sm mb-4">Comece cadastrando um novo serviço ou popule com dados de exemplo.</p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
            <button
              onClick={handleSeedServices}
              disabled={isSeeding}
              className="mt-4 flex items-center gap-2 bg-blue-100 text-blue-700 font-bold py-2 px-4 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
              Popular com 10 serviços padrão
            </button>
          </div>
        ) : (
          <ServicesTable services={services} onEdit={handleOpenForm} onDelete={openDeleteModal} onClone={handleClone} sortBy={sortBy} onSort={handleSort} />
        )}
      </div>

      {count > pageSize && (
        <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
      )}

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
    </div>
  );
}
