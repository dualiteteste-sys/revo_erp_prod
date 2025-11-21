import React, { useState } from 'react';
import { useCarriers } from '../../hooks/useCarriers';
import { useToast } from '../../contexts/ToastProvider';
import * as carriersService from '../../services/carriers';
import { Loader2, PlusCircle, Search, Truck } from 'lucide-react';
import Pagination from '../../components/ui/Pagination';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import Modal from '../../components/ui/Modal';
import CarriersTable from '../../components/carriers/CarriersTable';
import CarrierFormPanel from '../../components/carriers/CarrierFormPanel';
import Select from '@/components/ui/forms/Select';

const CarriersPage: React.FC = () => {
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
  const [selectedCarrier, setSelectedCarrier] = useState<carriersService.Carrier | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [carrierToDelete, setCarrierToDelete] = useState<carriersService.CarrierListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

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

  const handleSort = (column: keyof carriersService.CarrierListItem) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Transportadoras</h1>
        <button
          onClick={() => handleOpenForm()}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Nova Transportadora
        </button>
      </div>

      <div className="mb-4 flex gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome ou CNPJ..."
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
          <option value="ativa">Ativa</option>
          <option value="inativa">Inativa</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && carriers.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : carriers.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500">
            <Truck size={48} className="mb-4" />
            <p>Nenhuma transportadora encontrada.</p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
          </div>
        ) : (
          <CarriersTable carriers={carriers} onEdit={handleOpenForm} onDelete={handleOpenDeleteModal} sortBy={sortBy} onSort={handleSort} />
        )}
      </div>

      {count > pageSize && (
        <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
      )}

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedCarrier ? 'Editar Transportadora' : 'Nova Transportadora'}>
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
        description={`Tem certeza que deseja excluir a transportadora "${carrierToDelete?.nome_razao_social}"? Esta ação não pode ser desfeita.`}
        confirmText="Sim, Excluir"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
};

export default CarriersPage;
