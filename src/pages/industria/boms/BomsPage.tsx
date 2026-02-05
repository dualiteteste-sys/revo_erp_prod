import React, { useState, useEffect } from 'react';
import { listBoms, BomListItem, seedBoms, deleteBom, getBomDetails, BomDetails } from '@/services/industriaBom';
import { PlusCircle, Search, FileCog, DatabaseBackup } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/forms/Select';
import BomsTable from '@/components/industria/boms/BomsTable';
import { BomMobileCard } from '@/components/industria/boms/BomMobileCard';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import BomFormPanel from '@/components/industria/boms/BomFormPanel';
import { useToast } from '@/contexts/ToastProvider';
import { useSearchParams } from 'react-router-dom';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { isSeedEnabled } from '@/utils/seed';

export default function BomsPage() {
  const enableSeed = isSeedEnabled();
  const [boms, setBoms] = useState<BomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm } = useConfirm();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [initialFormData, setInitialFormData] = useState<Partial<BomDetails> | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Deep-link: /app/industria/boms?new=1
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setSelectedId(null);
    setInitialFormData(null);
    setIsFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Deep-link: /app/industria/boms?open=<bomId>
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    setSelectedId(openId);
    setInitialFormData(null);
    setIsFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBoms = async () => {
    setLoading(true);
    try {
      const data = await listBoms(debouncedSearch, undefined, typeFilter as any || undefined);
      setBoms(data);
    } catch (e) {
      logger.error('[Indústria][BOMs] Falha ao carregar BOMs', e, { q: debouncedSearch, typeFilter });
      addToast((e as any)?.message || 'Erro ao carregar BOMs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoms();
  }, [debouncedSearch, typeFilter]);

  const handleNew = () => {
    setSelectedId(null);
    setInitialFormData(null);
    setIsFormOpen(true);
  };

  const handleEdit = (bom: BomListItem) => {
    setSelectedId(bom.id);
    setInitialFormData(null);
    setIsFormOpen(true);
  };

  const handleClone = async (bom: BomListItem) => {
    setLoading(true);
    try {
      const fullData = await getBomDetails(bom.id);

      const { id, ...rest } = fullData;
      const clonedComponents = rest.componentes?.map(comp => {
        const { id, ...compRest } = comp;
        return { ...compRest, id: undefined, bom_id: undefined };
      }) || [];

      const clonedData: Partial<BomDetails> = {
        ...rest,
        id: undefined,
        descricao: `${rest.descricao} (Cópia)`,
        componentes: clonedComponents as any
      };

      setSelectedId(null);
      setInitialFormData(clonedData);
      setIsFormOpen(true);
    } catch (e: any) {
      addToast('Erro ao preparar clonagem.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (bom: BomListItem) => {
    const ok = await confirm({
      title: 'Excluir Ficha Técnica (BOM)',
      description: `Tem certeza que deseja excluir a BOM do produto "${bom.produto_nome}"? Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteBom(bom.id);
      addToast('BOM excluída com sucesso!', 'success');
      fetchBoms();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    }
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setSelectedId(null);
    setInitialFormData(null);
  };

  const handleSuccess = () => {
    fetchBoms();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedBoms();
      addToast('5 Fichas Técnicas (com componentes) criadas com sucesso!', 'success');
      fetchBoms();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <FileCog className="text-blue-600" /> Fichas Técnicas (BOM)
          </h1>
          <p className="text-gray-600 text-sm mt-1">Estruturas de produtos e listas de materiais.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {enableSeed ? (
            <Button onClick={handleSeed} disabled={isSeeding || loading} variant="secondary" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
              Popular Dados
            </Button>
          ) : null}
          <Button onClick={handleNew} className="gap-2">
            <PlusCircle size={18} />
            Nova Ficha Técnica
          </Button>
        </div>
      </div>

      <div className="mb-6 flex gap-4 flex-shrink-0">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por produto, código ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="min-w-[200px]"
        >
          <option value="">Todos os Tipos</option>
          <option value="producao">Produção</option>
          <option value="beneficiamento">Beneficiamento</option>
          <option value="ambos">Ambos</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden h-full overflow-y-auto">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : (
          <ResponsiveTable
            data={boms}
            getItemId={(b) => b.id}
            loading={loading}
            tableComponent={
              <BomsTable
                boms={boms}
                onEdit={handleEdit}
                onClone={handleClone}
                onDelete={handleDelete}
              />
            }
            renderMobileCard={(bom) => (
              <BomMobileCard
                key={bom.id}
                bom={bom}
                onEdit={() => handleEdit(bom)}
                onClone={() => handleClone(bom)}
                onDelete={() => handleDelete(bom)}
              />
            )}
          />
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Ficha Técnica' : 'Nova Ficha Técnica'} size="5xl">
        <BomFormPanel
          bomId={selectedId}
          initialData={initialFormData}
          onSaveSuccess={handleSuccess}
          onClose={handleClose}
        />
      </Modal>
    </div>
  );
}
