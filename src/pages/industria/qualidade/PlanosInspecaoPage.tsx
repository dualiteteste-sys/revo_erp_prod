import React, { useEffect, useState } from 'react';
import { Loader2, PlusCircle, RefreshCcw } from 'lucide-react';
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

export default function PlanosInspecaoPage() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [planos, setPlanos] = useState<PlanoInspecao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const handleEdit = (id: string) => {
    setEditingId(id);
    setIsModalOpen(true);
  };

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
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Planos de Inspeção</h1>
          <p className="text-sm text-gray-500">
            Configure IP/IF vinculadas aos produtos e etapas para garantir liberação da próxima fase somente após a aprovação.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={loadPlanos} variant="outline" className="gap-2">
            <RefreshCcw size={16} /> Atualizar
          </Button>
          <Button onClick={handleNew} className="gap-2">
            <PlusCircle size={18} /> Novo Plano
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="relative w-full md:w-96">
          <input
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            placeholder="Buscar por nome, produto ou etapa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="8" cy="8" r="6" />
            <line x1="12.5" y1="12.5" x2="16" y2="16" />
          </svg>
        </div>
      </div>

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
        onClose={() => setIsModalOpen(false)}
        planoId={editingId}
        onSaved={loadPlanos}
      />
    </div>
  );
}
