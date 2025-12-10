import React, { useState, useEffect } from 'react';
import { listCentrosTrabalho, CentroTrabalho, seedCentrosTrabalho, deleteCentroTrabalho } from '@/services/industriaCentros';
import { PlusCircle, Search, Settings, DatabaseBackup } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Modal from '@/components/ui/Modal';
import CentrosTrabalhoTable from '@/components/industria/centros-trabalho/CentrosTrabalhoTable';
import CentroTrabalhoFormPanel from '@/components/industria/centros-trabalho/CentroTrabalhoFormPanel';
import { useToast } from '@/contexts/ToastProvider';

export default function CentrosTrabalhoPage() {
  const [centros, setCentros] = useState<CentroTrabalho[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCentro, setSelectedCentro] = useState<CentroTrabalho | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const fetchCentros = async () => {
    setLoading(true);
    try {
      const data = await listCentrosTrabalho(debouncedSearch);
      setCentros(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCentros();
  }, [debouncedSearch]);

  const handleNew = () => {
    setSelectedCentro(null);
    setIsFormOpen(true);
  };

  const handleEdit = (centro: CentroTrabalho) => {
    setSelectedCentro(centro);
    setIsFormOpen(true);
  };

  const handleClone = (centro: CentroTrabalho) => {
    const { id, ...rest } = centro;
    // Cast to any to bypass strict type check for missing ID, ensuring it's treated as new by the form
    setSelectedCentro(rest as any);
    setIsFormOpen(true);
  };

  const handleDelete = async (centro: CentroTrabalho) => {
    if (!confirm(`Tem certeza que deseja excluir "${centro.nome}"?`)) return;

    try {
      await deleteCentroTrabalho(centro.id);
      addToast('Centro de trabalho excluído com sucesso!', 'success');
      fetchCentros();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir.', 'error');
    }
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setSelectedCentro(null);
  };

  const handleSuccess = () => {
    fetchCentros();
    handleClose();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedCentrosTrabalho();
      addToast('5 Centros de Trabalho criados com sucesso!', 'success');
      fetchCentros();
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
            <Settings className="text-blue-600" /> Centros de Trabalho
          </h1>
          <p className="text-gray-600 text-sm mt-1">Locais onde as operações são executadas.</p>
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
            Novo Centro
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4 flex-shrink-0">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden h-full overflow-y-auto">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : (
          <CentrosTrabalhoTable
            centros={centros}
            onEdit={handleEdit}
            onClone={handleClone}
            onDelete={handleDelete}
          />
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedCentro ? 'Editar Centro de Trabalho' : 'Novo Centro de Trabalho'} size="70pct">
        <CentroTrabalhoFormPanel centro={selectedCentro} onSaveSuccess={handleSuccess} onClose={handleClose} />
      </Modal>
    </div>
  );
}
