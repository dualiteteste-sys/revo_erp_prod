import React, { useEffect, useState } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useOs } from '@/hooks/useOs';
import { useToast } from '@/contexts/ToastProvider';
import * as osService from '@/services/os';
import { Loader2, PlusCircle, ClipboardCheck, LayoutGrid } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import OsTable from '@/components/os/OsTable';
import OsFormPanel from '@/components/os/OsFormPanel';
import Select from '@/components/ui/forms/Select';
import OsKanbanModal from '@/components/os/kanban/OsKanbanModal';
import { Database } from '@/types/database.types';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/forms/SearchField';
import { Button } from '@/components/ui/button';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { useHasPermission } from '@/hooks/useHasPermission';
import { traceAction } from '@/lib/tracing';
import { useOnboardingGate } from '@/contexts/OnboardingGateContext';
import { useAuth } from '@/contexts/AuthProvider';

const OSPage: React.FC = () => {
  const {
    serviceOrders,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    sortBy,
    onlyMine,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterStatus,
    setSortBy,
    setOnlyMine,
    refresh,
    reorderOs,
  } = useOs();
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const { ensure } = useOnboardingGate();
  const { userId } = useAuth();
  const permCreate = useHasPermission('os', 'create');
  const permUpdate = useHasPermission('os', 'update');
  const permDelete = useHasPermission('os', 'delete');
  const permManage = useHasPermission('os', 'manage');
  const permReports = useHasPermission('relatorios_servicos', 'view');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedOs, setSelectedOs] = useState<osService.OrdemServicoDetails | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [osToDelete, setOsToDelete] = useState<osService.OrdemServico | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isKanbanModalOpen, setIsKanbanModalOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const osId = searchParams.get('osId');
    if (!osId) return;

    void (async () => {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedOs(null);
      try {
        const details = await osService.getOsDetails(osId);
        setSelectedOs(details);
      } catch (e: any) {
        addToast(e?.message || 'Erro ao abrir a O.S.', 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
        const next = new URLSearchParams(searchParams);
        next.delete('osId');
        setSearchParams(next, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenForm = async (os: osService.OrdemServico | null = null) => {
    if (os?.id) {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedOs(null);
      try {
        const details = await osService.getOsDetails(os.id);
        setSelectedOs(details);
      } catch (e: any) {
        addToast(e.message, 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
      }
    } else {
      setSelectedOs(null);
      setIsFormOpen(true);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedOs(null);
  };

  const handleSaveSuccess = () => {
    refresh();
    handleCloseForm();
  };

  const handleOpenDeleteModal = (os: osService.OrdemServico) => {
    setOsToDelete(os);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setOsToDelete(null);
  };

  const handleDelete = async () => {
    if (!osToDelete?.id) return;
    setIsDeleting(true);
    try {
      await osService.deleteOs(osToDelete.id);
      addToast('Ordem de Serviço excluída com sucesso!', 'success');
      refresh();
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetStatus = async (os: osService.OrdemServico, next: Database['public']['Enums']['status_os']) => {
    if (statusUpdatingId === os.id) return;
    const labelMap: Record<Database['public']['Enums']['status_os'], string> = {
      orcamento: 'Orçamento',
      aberta: 'Aberta',
      concluida: 'Concluída',
      cancelada: 'Cancelada',
    };

    const shouldConfirm = next === 'concluida' || next === 'cancelada';
    if (shouldConfirm && !permManage.data) {
      addToast('Você não tem permissão para concluir/cancelar O.S.', 'warning');
      return;
    }
    if (shouldConfirm) {
      const ok = await confirm({
        title: next === 'concluida' ? 'Concluir O.S.' : 'Cancelar O.S.',
        description:
          next === 'concluida'
            ? `Deseja concluir a O.S. nº ${os.numero}?`
            : `Deseja cancelar a O.S. nº ${os.numero}?`,
        confirmText: next === 'concluida' ? 'Concluir' : 'Cancelar',
        cancelText: 'Voltar',
        variant: next === 'cancelada' ? 'danger' : 'default',
      });
      if (!ok) return;
    }

    if (next === 'concluida') {
      const gate = await ensure(['tesouraria.padrao_recebimentos']);
      if (!gate.ok) return;
    }

    try {
      setStatusUpdatingId(os.id);
      await traceAction(
        'os.set_status',
        () => osService.setOsStatus(os.id, next),
        { os_id: os.id, from_status: os.status, to_status: next }
      );
      addToast(`Status atualizado para “${labelMap[next]}”.`, 'success');
      refresh();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao atualizar status.', 'error');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleSort = (column: keyof osService.OrdemServico) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };
  
  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    if (!permUpdate.data) {
      addToast('Você não tem permissão para reordenar O.S.', 'warning');
      return;
    }

    const startIndex = result.source.index;
    const endIndex = result.destination.index;

    try {
        await reorderOs(startIndex, endIndex);
        addToast('Ordem das O.S. atualizada.', 'success');
    } catch (error: any) {
        addToast(error.message || 'Falha ao reordenar.', 'error');
    }
  };

  return (
    <div className="p-1 min-h-full flex flex-col">
      <PageHeader
        title="Ordens de Serviço"
        description="Orçamento, execução e agenda de serviços."
        icon={<ClipboardCheck className="w-5 h-5" />}
        actions={
          <>
            {permReports.data ? (
              <Button onClick={() => navigate('/app/servicos/relatorios')} variant="outline" className="gap-2">
                Relatórios
              </Button>
            ) : null}
            <Button onClick={() => setIsKanbanModalOpen(true)} variant="outline" className="gap-2">
              <LayoutGrid size={18} />
              Agenda
            </Button>
            {permCreate.data ? (
              <Button onClick={() => handleOpenForm()} className="gap-2">
                <PlusCircle size={18} />
                Nova O.S.
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 mt-6 flex gap-4 flex-wrap items-end">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={!onlyMine ? 'default' : 'outline'}
            onClick={() => setOnlyMine(false)}
          >
            Todas
          </Button>
          <Button
            type="button"
            variant={onlyMine ? 'default' : 'outline'}
            onClick={() => {
              if (!userId) return;
              setOnlyMine(true);
            }}
          >
            Minha fila
          </Button>
        </div>
        <SearchField
          placeholder="Buscar por cliente ou descrição..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-sm"
        />
        <Select
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value as Database['public']['Enums']['status_os'] || null)}
          className="min-w-[200px]"
        >
          <option value="">Todos os status</option>
          <option value="orcamento">Orçamento</option>
          <option value="aberta">Aberta</option>
          <option value="concluida">Concluída</option>
          <option value="cancelada">Cancelada</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-1 min-h-0">
        {loading && serviceOrders.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : serviceOrders.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500">
            <ClipboardCheck size={48} className="mb-4" />
            <p>Nenhuma Ordem de Serviço encontrada.</p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <OsTable
              serviceOrders={serviceOrders}
              onEdit={handleOpenForm}
              onDelete={handleOpenDeleteModal}
              onOpenAgenda={() => setIsKanbanModalOpen(true)}
              onSetStatus={handleSetStatus}
              sortBy={sortBy}
              onSort={handleSort}
              canUpdate={permUpdate.data}
              canManage={permManage.data}
              canDelete={permDelete.data}
              busyOsId={statusUpdatingId}
            />
          </DragDropContext>
        )}
      </div>

      {count > 0 ? (
        <div className="sticky bottom-0 z-20 mt-4 border-t border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <Pagination
            currentPage={page}
            totalCount={count}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPage(1);
              setPageSize(next);
            }}
          />
        </div>
      ) : null}

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedOs ? 'Editar Ordem de Serviço' : 'Nova Ordem de Serviço'}>
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[500px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <OsFormPanel os={selectedOs} onSaveSuccess={handleSaveSuccess} onClose={handleCloseForm} />
        )}
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja excluir a O.S. nº ${osToDelete?.numero}? Esta ação não pode ser desfeita.`}
        confirmText="Sim, Excluir"
        isLoading={isDeleting}
        variant="danger"
      />
      
      <OsKanbanModal
        isOpen={isKanbanModalOpen}
        onClose={() => setIsKanbanModalOpen(false)}
        canUpdate={permUpdate.data}
        canManage={permManage.data}
      />
    </div>
  );
};

export default OSPage;
