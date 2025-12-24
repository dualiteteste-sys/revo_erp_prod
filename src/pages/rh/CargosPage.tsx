import React, { useState, useEffect } from 'react';
import { listCargos, Cargo, getCargoDetails, CargoDetails, seedCargos } from '@/services/rh';
import { PlusCircle, Briefcase, Edit, Users, DatabaseBackup } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import CargoFormPanel from '@/components/rh/CargoFormPanel';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/contexts/ToastProvider';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/forms/SearchField';

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
      addToast((error as any)?.message || 'Erro ao carregar cargos.', 'error');
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
      addToast((error as any)?.message || 'Erro ao carregar cargo.', 'error');
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
    <div className="p-1 space-y-6">
      <PageHeader
        title="Cargos e Funções"
        description="Gestão de responsabilidades e autoridades (ISO 9001)."
        icon={<Briefcase className="w-5 h-5" />}
        actions={
          <>
            <Button onClick={handleSeed} disabled={isSeeding || loading} variant="outline" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />}
              Popular Dados
            </Button>
            <Button onClick={handleNew} className="gap-2">
              <PlusCircle size={18} />
              Novo Cargo
            </Button>
          </>
        }
      />

      <SearchField
        placeholder="Buscar cargos..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

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
            <div className="col-span-full">
              <div className="text-center py-12 text-gray-500 bg-white border border-gray-100 rounded-2xl">
                Nenhum cargo encontrado.
              </div>
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
