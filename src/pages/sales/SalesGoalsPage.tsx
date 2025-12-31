import React, { useState } from 'react';
import { useSalesGoals } from '@/hooks/useSalesGoals';
import { useToast } from '@/contexts/ToastProvider';
import * as salesGoalsService from '@/services/salesGoals';
import { AlertTriangle, Loader2, PlusCircle, Search, Target } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import SalesGoalsTable from '@/components/sales-goals/SalesGoalsTable';
import SalesGoalFormPanel from '@/components/sales-goals/SalesGoalFormPanel';
import Select from '@/components/ui/forms/Select';
import { SeedButton } from '@/components/common/SeedButton';

const SalesGoalsPage: React.FC = () => {
  const {
    goals,
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
  } = useSalesGoals();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<salesGoalsService.SalesGoal | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<salesGoalsService.SalesGoal | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const handleOpenForm = async (goal: salesGoalsService.SalesGoal | null = null) => {
    if (goal?.id) {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedGoal(null);
      try {
        const details = await salesGoalsService.getSalesGoalDetails(goal.id);
        setSelectedGoal(details);
      } catch (e: any) {
        addToast(e.message, 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
      }
    } else {
      setSelectedGoal(null);
      setIsFormOpen(true);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedGoal(null);
  };

  const handleSaveSuccess = () => {
    refresh();
    handleCloseForm();
  };

  const handleOpenDeleteModal = (goal: salesGoalsService.SalesGoal) => {
    setGoalToDelete(goal);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setGoalToDelete(null);
  };

  const handleDelete = async () => {
    if (!goalToDelete?.id) return;
    setIsDeleting(true);
    try {
      await salesGoalsService.deleteSalesGoal(goalToDelete.id);
      addToast('Meta excluída com sucesso!', 'success');
      refresh();
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir meta.', 'error');
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

  const riskCount = goals.filter((g) => {
    if (g.status === 'concluida' || g.status === 'cancelada') return false;
    const days = Math.ceil((new Date(g.data_fim).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days <= 7 && g.atingimento < 80;
  }).length;

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await salesGoalsService.seedSalesGoals();
      addToast('5 Metas de Venda criadas com sucesso!', 'success');
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
        <h1 className="text-3xl font-bold text-gray-800">Metas de Vendas</h1>
        <div className="flex items-center gap-2">
            <SeedButton 
              onSeed={handleSeed} 
              isSeeding={isSeeding} 
              disabled={loading} 
            />
            <button
              onClick={() => handleOpenForm()}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle size={20} />
              Nova Meta
            </button>
        </div>
      </div>

      <div className="mb-4 flex gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por vendedor..."
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
          <option value="nao_iniciada">Não Iniciada</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="concluida">Concluída</option>
          <option value="cancelada">Cancelada</option>
        </Select>
        {riskCount > 0 ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-100 text-sm">
            <AlertTriangle size={16} /> {riskCount} meta(s) em risco (fim em ≤ 7 dias e &lt; 80%)
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && goals.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : goals.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500">
            <Target size={48} className="mb-4" />
            <p>Nenhuma meta de venda encontrada.</p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
          </div>
        ) : (
          <SalesGoalsTable goals={goals} onEdit={handleOpenForm} onDelete={handleOpenDeleteModal} sortBy={sortBy} onSort={handleSort} />
        )}
      </div>

      {count > pageSize && (
        <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
      )}

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedGoal ? 'Editar Meta de Venda' : 'Nova Meta de Venda'}>
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <SalesGoalFormPanel goal={selectedGoal} onSaveSuccess={handleSaveSuccess} onClose={handleCloseForm} />
        )}
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja excluir a meta para "${goalToDelete?.vendedor_nome}"?`}
        confirmText="Sim, Excluir"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
};

export default SalesGoalsPage;
