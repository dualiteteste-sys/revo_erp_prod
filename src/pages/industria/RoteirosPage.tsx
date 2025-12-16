import React, { useState, useEffect } from 'react';
import { listRoteiros, RoteiroListItem, seedRoteiros, deleteRoteiro, getRoteiroDetails, RoteiroDetails } from '@/services/industriaRoteiros';
import { PlusCircle, Search, Route, DatabaseBackup } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/forms/Select';
import RoteirosTable from '@/components/industria/roteiros/RoteirosTable';
import RoteiroFormPanel from '@/components/industria/roteiros/RoteiroFormPanel';
import { useToast } from '@/contexts/ToastProvider';
import { useSearchParams } from 'react-router-dom';

export default function RoteirosPage() {
  const [roteiros, setRoteiros] = useState<RoteiroListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [initialFormData, setInitialFormData] = useState<Partial<RoteiroDetails> | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Deep-link: /app/industria/roteiros?new=1
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setSelectedId(null);
    setInitialFormData(null);
    setIsFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchRoteiros = async () => {
    setLoading(true);
    try {
      const data = await listRoteiros(debouncedSearch, undefined, typeFilter as any || undefined);
      setRoteiros(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoteiros();
  }, [debouncedSearch, typeFilter]);

  const handleNew = () => {
    setSelectedId(null);
    setInitialFormData(null);
    setIsFormOpen(true);
  };

  const handleEdit = (roteiro: RoteiroListItem) => {
    setSelectedId(roteiro.id);
    setInitialFormData(null);
    setIsFormOpen(true);
  };

  const handleClone = async (roteiro: RoteiroListItem) => {
    setLoading(true);
    try {
      const fullData = await getRoteiroDetails(roteiro.id);

      // Deep copy and strip IDs to treat as new
      const { id, ...rest } = fullData;
      const clonedEtapas = rest.etapas?.map(etapa => {
        const { id, ...etapaRest } = etapa;
        return { ...etapaRest, id: undefined }; // Ensure ID is undefined for new insertion
      }) || [];

      const clonedData: Partial<RoteiroDetails> = {
        ...rest,
        id: undefined, // Explicitly undefined
        descricao: `${rest.descricao} (Cópia)`,
        etapas: clonedEtapas as any
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

  const handleDelete = async (roteiro: RoteiroListItem) => {
    if (!confirm(`Tem certeza que deseja excluir o roteiro "${roteiro.descricao}"?`)) return;

    try {
      await deleteRoteiro(roteiro.id);
      addToast('Roteiro excluído com sucesso!', 'success');
      fetchRoteiros();
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
    fetchRoteiros();
    handleClose();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedRoteiros();
      addToast('5 Roteiros (com etapas) criados com sucesso!', 'success');
      fetchRoteiros();
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
            <Route className="text-blue-600" /> Roteiros de Produção
          </h1>
          <p className="text-gray-600 text-sm mt-1">Sequência de operações e centros de trabalho.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeed}
            disabled={isSeeding || loading}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
            Popular Dados
          </button>
          <button
            onClick={handleNew}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusCircle size={20} />
            Novo Roteiro
          </button>
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
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden h-full overflow-y-auto">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : (
          <RoteirosTable
            roteiros={roteiros}
            onEdit={handleEdit}
            onClone={handleClone}
            onDelete={handleDelete}
          />
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Roteiro' : 'Novo Roteiro'} size="90pct">
        <RoteiroFormPanel
          roteiroId={selectedId}
          initialData={initialFormData}
          onSaveSuccess={handleSuccess}
          onClose={handleClose}
        />
      </Modal>
    </div>
  );
}
