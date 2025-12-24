import React, { useState, useEffect } from 'react';
import { listColaboradores, Colaborador, getColaboradorDetails, ColaboradorDetails, seedColaboradores } from '@/services/rh';
import { PlusCircle, Briefcase, Edit, DatabaseBackup, Users } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import ColaboradorFormPanel from '@/components/rh/ColaboradorFormPanel';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/contexts/ToastProvider';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/forms/SearchField';

export default function ColaboradoresPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedColaborador, setSelectedColaborador] = useState<ColaboradorDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const fetchColaboradores = async () => {
    setLoading(true);
    try {
      const data = await listColaboradores(debouncedSearch);
      setColaboradores(data);
    } catch (error) {
      addToast((error as any)?.message || 'Erro ao carregar colaboradores.', 'error');
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
      addToast((error as any)?.message || 'Erro ao carregar colaborador.', 'error');
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

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedColaboradores();
      addToast('5 Colaboradores criados com sucesso!', 'success');
      fetchColaboradores();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1 space-y-6">
      <PageHeader
        title="Colaboradores"
        description="Gestão de pessoas, cargos e avaliações de competência."
        icon={<Users className="w-5 h-5" />}
        actions={
          <>
            <Button onClick={handleSeed} disabled={isSeeding || loading} variant="outline" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />}
              Popular Dados
            </Button>
            <Button onClick={handleNew} className="gap-2">
              <PlusCircle size={18} />
              Novo Colaborador
            </Button>
          </>
        }
      />

      <SearchField
        placeholder="Buscar por nome ou e-mail..."
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
            <div className="col-span-full">
              <div className="text-center py-12 text-gray-500 bg-white border border-gray-100 rounded-2xl">
                Nenhum colaborador encontrado.
              </div>
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
