import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PlusCircle, RefreshCcw, ClipboardCheck } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/contexts/ToastProvider';
import {
  PlanoInspecao,
  deletePlanoInspecao,
  listPlanosInspecao
} from '@/services/industriaProducao';
import PlanosInspecaoTable from '@/components/industria/qualidade/PlanosInspecaoTable';
import PlanoInspecaoFormModal from '@/components/industria/qualidade/PlanoInspecaoFormModal';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/forms/SearchField';
import { useSearchParams } from 'react-router-dom';
import { useEditLock } from '@/components/ui/hooks/useEditLock';

export default function PlanosInspecaoPage() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const editLock = useEditLock('industria:qualidade:planos-inspecao');
  const [planos, setPlanos] = useState<PlanoInspecao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const clearOpenParam = useCallback(() => {
    if (!openId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [openId, searchParams, setSearchParams]);

  const loadPlanos = async () => {
    setLoading(true);
    try {
      const data = await listPlanosInspecao(debouncedSearch || undefined);
      setPlanos(data);
    } catch (error: any) {
      addToast(error.message || 'Erro ao carregar planos de inspeção.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlanos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleNew = () => {
    setEditingId(null);
    setIsModalOpen(true);
  };

  const handleEdit = useCallback(async (id: string) => {
    const claimed = await editLock.claim(id, {
      confirmConflict: async () =>
        confirm({
          title: 'Este plano já está aberto em outra aba',
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
    setEditingId(id);
    setIsModalOpen(true);
  }, [clearOpenParam, confirm, editLock]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    clearOpenParam();
    if (editingId) editLock.release(editingId);
    setEditingId(null);
  }, [clearOpenParam, editLock, editingId]);

  useEffect(() => {
    if (!openId) return;
    if (isModalOpen) return;
    void handleEdit(openId);
  }, [handleEdit, isModalOpen, openId]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir plano de inspeção',
      description: 'Deseja realmente excluir este plano? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deletePlanoInspecao(id);
      addToast('Plano removido com sucesso!', 'success');
      loadPlanos();
    } catch (error: any) {
      addToast(error.message || 'Erro ao remover plano.', 'error');
    }
  };

  return (
    <div className="p-1 space-y-6">
      <PageHeader
        title="Planos de Inspeção"
        description="Configure IP/IF vinculadas aos produtos e etapas para liberar a próxima fase somente após aprovação."
        icon={<ClipboardCheck className="w-5 h-5" />}
        actions={
          <>
            <Button onClick={loadPlanos} variant="outline" className="gap-2">
              <RefreshCcw size={16} /> Atualizar
            </Button>
            <Button onClick={handleNew} className="gap-2">
              <PlusCircle size={18} /> Novo Plano
            </Button>
          </>
        }
      />

      <SearchField
        placeholder="Buscar por nome, produto ou etapa..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-blue-600 gap-2">
          <Loader2 className="animate-spin" />
          Carregando planos...
        </div>
      ) : (
        <PlanosInspecaoTable planos={planos} onEdit={handleEdit} onDelete={handleDelete} />
      )}

      <PlanoInspecaoFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        planoId={editingId}
        onSaved={loadPlanos}
      />
    </div>
  );
}
