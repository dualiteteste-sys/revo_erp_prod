import React, { useState, useEffect } from 'react';
import { listCompetencias, Competencia, seedCompetencias } from '@/services/rh';
import { PlusCircle, Search, BookOpen, Edit, ShieldCheck, DatabaseBackup } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import CompetenciaFormPanel from '@/components/rh/CompetenciaFormPanel';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/contexts/ToastProvider';

export default function CompetenciasPage() {
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCompetencia, setSelectedCompetencia] = useState<Competencia | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const fetchCompetencias = async () => {
    setLoading(true);
    try {
      const data = await listCompetencias(debouncedSearch);
      setCompetencias(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompetencias();
  }, [debouncedSearch]);

  const handleEdit = (comp: Competencia) => {
    setSelectedCompetencia(comp);
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setSelectedCompetencia(null);
    setIsFormOpen(true);
  };

  const handleSaveSuccess = () => {
    setIsFormOpen(false);
    fetchCompetencias();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedCompetencias();
      addToast('5 Competências criadas com sucesso!', 'success');
      fetchCompetencias();
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
          <h1 className="text-3xl font-bold text-gray-800">Banco de Competências</h1>
          <p className="text-gray-600 text-sm mt-1">Habilidades, conhecimentos e certificações.</p>
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
              Nova Competência
            </button>
        </div>
      </div>

      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar competências..."
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
          {competencias.map(comp => (
            <GlassCard key={comp.id} className="p-6 flex flex-col justify-between hover:shadow-xl transition-shadow cursor-pointer border-l-4 border-l-purple-500" onClick={() => handleEdit(comp)}>
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-gray-800">{comp.nome}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 capitalize`}>
                    {comp.tipo}
                  </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                  {comp.descricao || 'Sem descrição.'}
                </p>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  {comp.critico_sgq && (
                    <span className="flex items-center gap-1 text-red-600 font-medium" title="Crítico para Qualidade">
                      <ShieldCheck size={16} /> SGQ
                    </span>
                  )}
                </div>
                <button className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                  <Edit size={14} /> Editar
                </button>
              </div>
            </GlassCard>
          ))}
          {competencias.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              Nenhuma competência encontrada.
            </div>
          )}
        </div>
      )}

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={selectedCompetencia ? 'Editar Competência' : 'Nova Competência'}>
        <CompetenciaFormPanel competencia={selectedCompetencia} onSaveSuccess={handleSaveSuccess} onClose={() => setIsFormOpen(false)} />
      </Modal>
    </div>
  );
}
