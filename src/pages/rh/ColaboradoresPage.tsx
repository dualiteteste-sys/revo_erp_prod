import React, { useState, useEffect } from 'react';
import { listColaboradores, Colaborador, getColaboradorDetails, ColaboradorDetails } from '@/services/rh';
import { PlusCircle, Search, User, Briefcase, Edit, Phone, Mail } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import ColaboradorFormPanel from '@/components/rh/ColaboradorFormPanel';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

export default function ColaboradoresPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedColaborador, setSelectedColaborador] = useState<ColaboradorDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchColaboradores = async () => {
    setLoading(true);
    try {
      const data = await listColaboradores(debouncedSearch);
      setColaboradores(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchColaboradores();
  }, [debouncedSearch]);

  const handleEdit = async (id: string) => {
    setLoadingDetails(true);
    setIsFormOpen(true);
    setSelectedColaborador(null);
    try {
      const details = await getColaboradorDetails(id);
      setSelectedColaborador(details);
    } catch (error) {
      console.error(error);
      setIsFormOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleNew = () => {
    setSelectedColaborador(null);
    setIsFormOpen(true);
  };

  const handleSaveSuccess = () => {
    setIsFormOpen(false);
    fetchColaboradores();
  };

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Colaboradores</h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de pessoas e avaliações de competência.</p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Novo Colaborador
        </button>
      </div>

      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail..."
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
          {colaboradores.map(colab => (
            <GlassCard key={colab.id} className="p-6 flex flex-col justify-between hover:shadow-xl transition-shadow cursor-pointer border-l-4 border-l-green-500" onClick={() => handleEdit(colab.id)}>
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                      {colab.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800">{colab.nome}</h3>
                      <p className="text-xs text-gray-500">{colab.email || 'Sem e-mail'}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colab.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {colab.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Briefcase size={16} className="text-gray-400" />
                    <span>{colab.cargo_nome || 'Sem cargo definido'}</span>
                  </div>
                  {colab.data_admissao && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="text-gray-400 text-xs">Admissão:</span>
                      <span>{new Date(colab.data_admissao).toLocaleDateString('pt-BR')}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-sm text-gray-500">
                <div className="flex items-center gap-1" title="Competências Avaliadas">
                  <span className="font-semibold text-blue-600">{colab.total_competencias_avaliadas || 0}</span>
                  <span>avaliações</span>
                </div>
                <button className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                  <Edit size={14} /> Gerenciar
                </button>
              </div>
            </GlassCard>
          ))}
          {colaboradores.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              Nenhum colaborador encontrado.
            </div>
          )}
        </div>
      )}

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={selectedColaborador ? 'Editar Colaborador' : 'Novo Colaborador'}>
        {loadingDetails ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
          </div>
        ) : (
          <ColaboradorFormPanel colaborador={selectedColaborador} onSaveSuccess={handleSaveSuccess} onClose={() => setIsFormOpen(false)} />
        )}
      </Modal>
    </div>
  );
}
