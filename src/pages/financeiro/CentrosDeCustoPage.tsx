import React, { useState } from 'react';
import { useCentrosDeCusto } from '@/hooks/useCentrosDeCusto';
import { useToast } from '@/contexts/ToastProvider';
import * as centrosDeCustoService from '@/services/centrosDeCusto';
import { Loader2, PlusCircle, Search, Landmark } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import CentrosDeCustoTable from '@/components/financeiro/centros-de-custo/CentrosDeCustoTable';
import CentrosDeCustoFormPanel from '@/components/financeiro/centros-de-custo/CentrosDeCustoFormPanel';
import Select from '@/components/ui/forms/Select';

const CentrosDeCustoPage: React.FC = () => {
  const {
    centros,
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
  } = useCentrosDeCusto();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCentro, setSelectedCentro] = useState<centrosDeCustoService.CentroDeCusto | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [centroToDelete, setCentroToDelete] = useState<centrosDeCustoService.CentroDeCustoListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  const handleOpenForm = async (centro: centrosDeCustoService.CentroDeCustoListItem | null = null) => {
    if (centro?.id) {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedCentro(null);
      try {
        const details = await centrosDeCustoService.getCentroDeCustoDetails(centro.id);
        setSelectedCentro(details);
      } catch (e: any) {
        addToast(e.message, 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
      }
    } else {
      setSelectedCentro(null);
      setIsFormOpen(true);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedCentro(null);
  };

  const handleSaveSuccess = () => {
    refresh();
    handleCloseForm();
  };

  const handleOpenDeleteModal = (centro: centrosDeCustoService.CentroDeCustoListItem) => {
    setCentroToDelete(centro);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setCentroToDelete(null);
  };

  const handleDelete = async () => {
    if (!centroToDelete?.id) return;
    setIsDeleting(true);
    try {
      await centrosDeCustoService.deleteCentroDeCusto(centroToDelete.id);
      addToast('Centro de Custo excluído com sucesso!', 'success');
      refresh();
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSort = (column: string) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Centro de Custos</h1>
        <button
          onClick={() => handleOpenForm()}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Novo Centro de Custo
        </button>
      </div>

      <div className="mb-4 flex gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome ou código..."
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
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && centros.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : centros.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500">
            <Landmark size={48} className="mb-4" />
            <p>Nenhum centro de custo encontrado.</p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
          </div>
        ) : (
          <CentrosDeCustoTable centros={centros} onEdit={handleOpenForm} onDelete={handleOpenDeleteModal} sortBy={sortBy} onSort={handleSort} />
        )}
      </div>

      {count > pageSize && (
        <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
      )}

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedCentro ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}>
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[300px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <CentrosDeCustoFormPanel centro={selectedCentro} onSaveSuccess={handleSaveSuccess} onClose={handleCloseForm} />
        )}
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja excluir o centro de custo "${centroToDelete?.nome}"?`}
        confirmText="Sim, Excluir"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
};

export default CentrosDeCustoPage;
