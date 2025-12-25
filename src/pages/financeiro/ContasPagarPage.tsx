import React, { useState } from 'react';
import { useContasPagar } from '@/hooks/useContasPagar';
import { useToast } from '@/contexts/ToastProvider';
import * as financeiroService from '@/services/financeiro';
import { Loader2, PlusCircle, Search, TrendingDown, X, DatabaseBackup } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import ContasPagarTable from '@/components/financeiro/contas-pagar/ContasPagarTable';
import ContasPagarFormPanel from '@/components/financeiro/contas-pagar/ContasPagarFormPanel';
import ContasPagarSummary from '@/components/financeiro/contas-pagar/ContasPagarSummary';
import Select from '@/components/ui/forms/Select';
import DatePicker from '@/components/ui/DatePicker';
import ErrorAlert from '@/components/ui/ErrorAlert';
import { Button } from '@/components/ui/button';

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
    filterStartDate,
    filterEndDate,
    sortBy,
    setPage,
    setSearchTerm,
    setFilterStatus,
    setFilterStartDate,
    setFilterEndDate,
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
  const [isSeeding, setIsSeeding] = useState(false);

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

  const clearDateFilters = () => {
    setFilterStartDate(null);
    setFilterEndDate(null);
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await financeiroService.seedContasPagar();
      addToast('5 Contas a Pagar criadas com sucesso!', 'success');
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
        <h1 className="text-3xl font-bold text-gray-800">Contas a Pagar</h1>
        <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleSeed}
              disabled={isSeeding || loading}
              className="gap-2"
            >
              {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
              Popular Dados
            </Button>
            <Button onClick={() => handleOpenForm()} className="gap-2">
              <PlusCircle size={18} />
              Nova Conta
            </Button>
        </div>
      </div>

      {error ? (
        <div className="my-8">
          <ErrorAlert 
            title="Erro ao carregar dados" 
            message={error} 
            onRetry={refresh} 
          />
        </div>
      ) : (
        <>
          <ContasPagarSummary summary={summary} />

          <div className="mt-6 mb-4 flex flex-wrap gap-4 items-end">
            <div className="relative flex-grow max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar por descrição ou fornecedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <Select
              value={filterStatus || ''}
              onChange={(e) => setFilterStatus(e.target.value || null)}
              className="min-w-[180px]"
            >
              <option value="">Todos os status</option>
              <option value="aberta">Aberta</option>
              <option value="pendente">Pendente (Aberta)</option>
              <option value="parcial">Parcial</option>
              <option value="paga">Paga</option>
              <option value="cancelada">Cancelada</option>
            </Select>

            <div className="flex items-center gap-2">
                <DatePicker 
                    label="" 
                    value={filterStartDate} 
                    onChange={setFilterStartDate} 
                    className="w-[160px]"
                />
                <span className="text-gray-500">até</span>
                <DatePicker 
                    label="" 
                    value={filterEndDate} 
                    onChange={setFilterEndDate} 
                    className="w-[160px]"
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

          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading && contas.length === 0 ? (
              <div className="h-96 flex items-center justify-center">
                <Loader2 className="animate-spin text-blue-500" size={32} />
              </div>
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
        </>
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
