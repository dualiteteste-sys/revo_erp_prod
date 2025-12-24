import React, { useState, useEffect } from 'react';
import { listCompetencias, Competencia, seedCompetencias } from '@/services/rh';
import { PlusCircle, BookOpen, Edit, ShieldCheck, DatabaseBackup } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import CompetenciaFormPanel from '@/components/rh/CompetenciaFormPanel';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/contexts/ToastProvider';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/forms/SearchField';

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
      addToast((error as any)?.message || 'Erro ao carregar competências.', 'error');
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
    <div className="p-1 space-y-6">
      <PageHeader
        title="Banco de Competências"
        description="Habilidades, conhecimentos e certificações."
        icon={<BookOpen className="w-5 h-5" />}
        actions={
          <>
            <Button onClick={handleSeed} disabled={isSeeding || loading} variant="outline" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />}
              Popular Dados
            </Button>
            <Button onClick={handleNew} className="gap-2">
              <PlusCircle size={18} />
              Nova Competência
            </Button>
          </>
        }
      />

      <SearchField
        placeholder="Buscar competências..."
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
            <div className="col-span-full">
              <div className="text-center py-12 text-gray-500 bg-white border border-gray-100 rounded-2xl">
                Nenhuma competência encontrada.
              </div>
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
