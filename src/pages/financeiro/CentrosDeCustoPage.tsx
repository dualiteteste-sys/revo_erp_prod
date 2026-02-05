import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import * as centrosDeCustoService from '@/services/centrosDeCusto';
import { ClipboardPaste, Loader2, PlusCircle, Search, Landmark, DatabaseBackup } from 'lucide-react';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import CentrosDeCustoFormPanel from '@/components/financeiro/centros-de-custo/CentrosDeCustoFormPanel';
import CentrosDeCustoTreeTable from '@/components/financeiro/centros-de-custo/CentrosDeCustoTreeTable';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';
import { isSeedEnabled } from '@/utils/seed';
import CentrosDeCustoBulkCreateModal from '@/components/financeiro/centros-de-custo/CentrosDeCustoBulkCreateModal';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { useSearchParams } from 'react-router-dom';
import { useEditLock } from '@/components/ui/hooks/useEditLock';

const CentrosDeCustoPage: React.FC = () => {
  const enableSeed = isSeedEnabled();
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const editLock = useEditLock('financeiro:centros-de-custo');

  const [allCentros, setAllCentros] = useState<centrosDeCustoService.CentroDeCustoListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterTipo, setFilterTipo] = useState<centrosDeCustoService.TipoCentroCusto | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCentro, setSelectedCentro] = useState<centrosDeCustoService.CentroDeCusto | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [centroToDelete, setCentroToDelete] = useState<centrosDeCustoService.CentroDeCustoListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isBulkOpen, setIsBulkOpen] = useState(false);

  const refresh = async () => {
    if (!activeEmpresa) {
      setAllCentros([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await centrosDeCustoService.listAllCentrosDeCusto({
        status: (filterStatus as any) ?? null,
        tipo: filterTipo ?? null,
      });
      setAllCentros(rows);
    } catch (e: any) {
      setAllCentros([]);
      setError(e?.message || 'Não foi possível carregar centros de custo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresa, filterStatus, filterTipo]);

  const clearOpenParam = useCallback(() => {
    if (!openId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [openId, searchParams, setSearchParams]);

  const normalizedSearch = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);
  const centros = useMemo(() => {
    if (!normalizedSearch) return allCentros;

    const byId = new Map(allCentros.map((r) => [r.id, r]));
    const keep = new Set<string>();

    const matches = allCentros.filter((r) => {
      const hay = `${r.codigo ?? ''} ${r.nome ?? ''}`.toLowerCase();
      return hay.includes(normalizedSearch);
    });
    for (const m of matches) {
      keep.add(m.id);
      let cur = m.parent_id;
      while (cur) {
        if (keep.has(cur)) break;
        keep.add(cur);
        cur = byId.get(cur)?.parent_id ?? null;
      }
    }

    // sempre inclui raízes (1..4), se existirem
    for (const r of allCentros) {
      if (r.parent_id === null && ['1', '2', '3', '4'].includes(String(r.codigo ?? ''))) keep.add(r.id);
    }

    return allCentros.filter((r) => keep.has(r.id));
  }, [allCentros, normalizedSearch]);

  const allIdsWithChildren = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of centros) {
      if (!c.parent_id) continue;
      map.set(c.parent_id, (map.get(c.parent_id) ?? 0) + 1);
    }
    return new Set([...map.entries()].filter(([, n]) => n > 0).map(([id]) => id));
  }, [centros]);

  useEffect(() => {
    if (centros.length === 0) return;
    setExpandedIds((prev) => {
      if (prev.size > 0) return prev;
      const roots = centros.filter((c) => !c.parent_id).map((c) => c.id);
      return new Set(roots);
    });
  }, [centros]);

  const handleOpenForm = useCallback(async (centro: centrosDeCustoService.CentroDeCustoListItem | null = null) => {
    if (centro?.id) {
      const claimed = await editLock.claim(centro.id, {
        confirmConflict: async () =>
          confirm({
            title: 'Este centro de custo já está aberto em outra aba',
            description: 'Para evitar edição concorrente, abra em apenas uma aba. Deseja abrir mesmo assim nesta aba?',
            confirmText: 'Abrir mesmo assim',
            cancelText: 'Cancelar',
            variant: 'danger',
          }),
      });
      if (!claimed) {
        clearOpenParam();
        return;
      }

      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedCentro(null);
      setEditingId(centro.id);
      try {
        const details = await centrosDeCustoService.getCentroDeCustoDetails(centro.id);
        setSelectedCentro(details);
      } catch (e: any) {
        addToast(e.message, 'error');
        setIsFormOpen(false);
        editLock.release(centro.id);
        setEditingId(null);
      } finally {
        setIsFetchingDetails(false);
      }
    } else {
      setSelectedCentro(null);
      setIsFormOpen(true);
    }
  }, [addToast, clearOpenParam, confirm, editLock]);

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedCentro(null);
    clearOpenParam();
    if (editingId) editLock.release(editingId);
    setEditingId(null);
  };

  useEffect(() => {
    if (!openId) return;
    if (isFormOpen) return;
    void handleOpenForm({ id: openId } as any);
  }, [handleOpenForm, isFormOpen, openId]);

  const handleSaveSuccess = () => {
    void refresh();
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
      await refresh();
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
      await centrosDeCustoService.seedCentrosDeCusto();
      addToast('5 Centros de Custo criados com sucesso!', 'success');
      await refresh();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1 min-h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Centro de Custos</h1>
        <div className="flex items-center gap-2">
          {enableSeed ? (
            <Button onClick={handleSeed} disabled={isSeeding || loading} variant="outline" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
              Popular Dados
            </Button>
          ) : null}
          <Button onClick={() => setIsBulkOpen(true)} disabled={loading} variant="outline" className="gap-2">
            <ClipboardPaste size={20} />
            Criar em lote
          </Button>
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <PlusCircle size={20} />
            Novo Centro de Custo
          </Button>
        </div>
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
        <Select
          value={filterTipo || ''}
          onChange={(e) => setFilterTipo((e.target.value as any) || null)}
          className="min-w-[220px]"
        >
          <option value="">Todas as categorias</option>
          <option value="receita">Receitas</option>
          <option value="custo_variavel">Custos Variáveis</option>
          <option value="custo_fixo">Custos Fixos</option>
          <option value="investimento">Investimentos</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-1 min-h-0">
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
          <CentrosDeCustoTreeTable
            centros={centros}
            expandedIds={expandedIds}
            onToggleExpand={(id) => {
              setExpandedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onExpandAll={() => setExpandedIds(new Set([...allIdsWithChildren]))}
            onCollapseAll={() => setExpandedIds(new Set(centros.filter((c) => !c.parent_id).map((c) => c.id)))}
            onEdit={handleOpenForm}
            onDelete={handleOpenDeleteModal}
          />
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={selectedCentro ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}>
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full min-h-[300px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <CentrosDeCustoFormPanel centro={selectedCentro} onSaveSuccess={handleSaveSuccess} onClose={handleCloseForm} />
        )}
      </Modal>

      <CentrosDeCustoBulkCreateModal
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        onCreated={() => {
          setIsBulkOpen(false);
          void refresh();
        }}
      />

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
