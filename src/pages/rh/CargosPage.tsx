import React, { useState, useEffect } from 'react';
import { listCargos, Cargo, getCargoDetails, CargoDetails, seedCargos } from '@/services/rh';
import { PlusCircle, Search, Briefcase, Edit, Users, DatabaseBackup } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import CargoFormPanel from '@/components/rh/CargoFormPanel';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/contexts/ToastProvider';

export default function CargosPage() {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCargo, setSelectedCargo] = useState<CargoDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const fetchCargos = async () => {
    setLoading(true);
    try {
      const data = await listCargos(debouncedSearch);
      setCargos(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCargos();
  }, [debouncedSearch]);

  const handleEdit = async (id: string) => {
    setLoadingDetails(true);
    setIsFormOpen(true);
    setSelectedCargo(null);
    try {
      const details = await getCargoDetails(id);
      setSelectedCargo(details);
    } catch (error) {
      console.error(error);
      setIsFormOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleNew = () => {
    setSelectedCargo(null);
    setIsFormOpen(true);
  };

  const handleSaveSuccess = () => {
    setIsFormOpen(false);
    fetchCargos();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedCargos();
      addToast('5 Cargos criados com sucesso!', 'success');
      fetchCargos();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Cargos e Funções</h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de responsabilidades e autoridades (ISO 9001)</p>
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
              Novo Cargo
            </button>
        </div>
      </div>

      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar cargos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center h-64 items-center">
          <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cargos.map(cargo => (
            <GlassCard key={cargo.id} className="p-6 flex flex-col justify-between hover:shadow-xl transition-shadow cursor-pointer border-l-4 border-l-blue-500" onClick={() => handleEdit(cargo.id)}>
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-gray-800">{cargo.nome}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cargo.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {cargo.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-4">{cargo.setor || 'Sem setor definido'}</p>
                <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                  {cargo.descricao || 'Sem descrição.'}
                </p>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-sm text-gray-500">
                <div className="flex items-center gap-1" title="Colaboradores neste cargo">
                  <Users size={16} />
                  <span>{cargo.total_colaboradores || 0}</span>
                </div>
                <div className="flex items-center gap-1" title="Competências requeridas">
                  <Briefcase size={16} />
                  <span>{cargo.total_competencias || 0} req.</span>
                </div>
                <button className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                  <Edit size={14} /> Editar
                </button>
              </div>
            </GlassCard>
          ))}
          {cargos.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              Nenhum cargo encontrado.
            </div>
          )}
        </div>
      )}

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={selectedCargo ? 'Editar Cargo' : 'Novo Cargo'}>
        {loadingDetails ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
          </div>
        ) : (
          <CargoFormPanel cargo={selectedCargo} onSaveSuccess={handleSaveSuccess} onClose={() => setIsFormOpen(false)} />
        )}
      </Modal>
    </div>
  );
}
