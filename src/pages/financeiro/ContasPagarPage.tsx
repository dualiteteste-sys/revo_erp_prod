import React, { useState } from 'react';
import { useContasPagar } from '@/hooks/useContasPagar';
import { useToast } from '@/contexts/ToastProvider';
import * as financeiroService from '@/services/financeiro';
import { Loader2, PlusCircle, Search, TrendingDown } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import ContasPagarTable from '@/components/financeiro/contas-pagar/ContasPagarTable';
import ContasPagarFormPanel from '@/components/financeiro/contas-pagar/ContasPagarFormPanel';
import ContasPagarSummary from '@/components/financeiro/contas-pagar/ContasPagarSummary';
import Select from '@/components/ui/forms/Select';

const ContasPagarPage: React.FC = () => {
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
    sortBy,
    setPage,
    setSearchTerm,
    setFilterStatus,
    setSortBy,
    refresh,
  } = useContasPagar();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<financeiroService.ContaPagar | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [contaToDelete, setContaToDelete] = useState<financeiroService.ContaPagar | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

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

  const handleSort = (column: string) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Contas a Pagar</h1>
        <button
          onClick={() => handleOpenForm()}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Nova Conta
        </button>
      </div>

      <ContasPagarSummary summary={summary} />

      <div className="mt-6 mb-4 flex gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por descrição ou fornecedor..."
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
          <option value="pago">Pago</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && contas.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : contas.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500">
            <TrendingDown size={48} className="mb-4" />
            <p>Nenhuma conta a pagar encontrada.</p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
          </div>
        ) : (
          <ContasPagarTable contas={contas} onEdit={handleOpenForm} onDelete={handleOpenDeleteModal} sortBy={sortBy} onSort={handleSort} />
        )}
      </div>

      {count > pageSize && (
        <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
      )}

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedConta ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}>
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[500px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <ContasPagarFormPanel conta={selectedConta} onSaveSuccess={handleSaveSuccess} onClose={handleCloseForm} />
        )}
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
