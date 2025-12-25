import React, { useState } from 'react';
import { useCobrancas } from '@/hooks/useCobrancas';
import { useToast } from '@/contexts/ToastProvider';
import * as cobrancasService from '@/services/cobrancas';
import { Loader2, PlusCircle, Search, Landmark, DatabaseBackup, X } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import CobrancasTable from '@/components/financeiro/cobrancas/CobrancasTable';
import CobrancaFormPanel from '@/components/financeiro/cobrancas/CobrancaFormPanel';
import CobrancasSummary from '@/components/financeiro/cobrancas/CobrancasSummary';
import Select from '@/components/ui/forms/Select';
import DatePicker from '@/components/ui/DatePicker';
import { Button } from '@/components/ui/button';

export default function CobrancasBancariasPage() {
  const {
    cobrancas,
    summary,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    startVenc,
    endVenc,
    setPage,
    setSearchTerm,
    setFilterStatus,
    setStartVenc,
    setEndVenc,
    refresh,
  } = useCobrancas();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCobranca, setSelectedCobranca] = useState<cobrancasService.CobrancaBancaria | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [cobrancaToDelete, setCobrancaToDelete] = useState<cobrancasService.CobrancaBancaria | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const handleOpenForm = (cobranca: cobrancasService.CobrancaBancaria | null = null) => {
    setSelectedCobranca(cobranca);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedCobranca(null);
  };

  const handleSaveSuccess = () => {
    refresh();
    handleCloseForm();
  };

  const handleOpenDeleteModal = (cobranca: cobrancasService.CobrancaBancaria) => {
    setCobrancaToDelete(cobranca);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setCobrancaToDelete(null);
  };

  const handleDelete = async () => {
    if (!cobrancaToDelete?.id) return;
    setIsDeleting(true);
    try {
      await cobrancasService.deleteCobranca(cobrancaToDelete.id);
      addToast('Cobrança excluída com sucesso!', 'success');
      refresh();
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await cobrancasService.seedCobrancas();
      addToast('5 Cobranças criadas com sucesso!', 'success');
      refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const clearDateFilters = () => {
    setStartVenc(null);
    setEndVenc(null);
  };

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                <Landmark className="text-blue-600" /> Cobranças Bancárias
            </h1>
            <p className="text-gray-600 text-sm mt-1">Gestão de boletos, Pix e links de pagamento.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSeed} disabled={isSeeding || loading} variant="outline" className="gap-2">
            {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
            Popular Dados
          </Button>
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <PlusCircle size={20} />
            Nova Cobrança
          </Button>
        </div>
      </div>

      <CobrancasSummary summary={summary} />

      <div className="mt-6 mb-4 flex flex-wrap gap-4 items-end">
        <div className="relative flex-grow max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por cliente, doc ou nosso número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <Select
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value as any || null)}
          className="min-w-[180px]"
        >
          <option value="">Todos os status</option>
          <option value="pendente_emissao">Pendente</option>
          <option value="emitida">Emitida</option>
          <option value="registrada">Registrada</option>
          <option value="liquidada">Liquidada</option>
          <option value="erro">Com Erro</option>
        </Select>

        <div className="flex items-center gap-2">
            <DatePicker 
                label="" 
                value={startVenc} 
                onChange={setStartVenc} 
                className="w-[160px]"
            />
            <span className="text-gray-500">até</span>
            <DatePicker 
                label="" 
                value={endVenc} 
                onChange={setEndVenc} 
                className="w-[160px]"
            />
            {(startVenc || endVenc) && (
              <Button
                onClick={clearDateFilters}
                variant="ghost"
                size="icon"
                title="Limpar datas"
                className="text-muted-foreground hover:text-destructive"
              >
                <X size={18} />
              </Button>
            )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && cobrancas.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : cobrancas.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500">
            <Landmark size={48} className="mb-4 opacity-20" />
            <p>Nenhuma cobrança encontrada.</p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
          </div>
        ) : (
          <CobrancasTable cobrancas={cobrancas} onEdit={handleOpenForm} onDelete={handleOpenDeleteModal} />
        )}
      </div>

      {count > pageSize && (
        <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
      )}

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedCobranca ? 'Editar Cobrança' : 'Nova Cobrança'} size="4xl">
        <CobrancaFormPanel cobranca={selectedCobranca} onSaveSuccess={handleSaveSuccess} onClose={handleCloseForm} />
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja excluir a cobrança "${cobrancaToDelete?.documento_ref || 'S/N'}"?`}
        confirmText="Sim, Excluir"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
}
