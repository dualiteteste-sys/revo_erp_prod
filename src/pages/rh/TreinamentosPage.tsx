import React, { useState, useEffect } from 'react';
import { listTreinamentos, Treinamento, getTreinamentoDetails, TreinamentoDetails, seedTreinamentos } from '@/services/rh';
import { PlusCircle, Search, GraduationCap, Edit, Calendar, User, DatabaseBackup } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import TreinamentoFormPanel from '@/components/rh/TreinamentoFormPanel';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Select from '@/components/ui/forms/Select';
import { useToast } from '@/contexts/ToastProvider';

export default function TreinamentosPage() {
  const [treinamentos, setTreinamentos] = useState<Treinamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTreinamento, setSelectedTreinamento] = useState<TreinamentoDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const fetchTreinamentos = async () => {
    setLoading(true);
    try {
      const data = await listTreinamentos(debouncedSearch, statusFilter || undefined);
      setTreinamentos(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTreinamentos();
  }, [debouncedSearch, statusFilter]);

  const handleEdit = async (id: string) => {
    setLoadingDetails(true);
    setIsFormOpen(true);
    setSelectedTreinamento(null);
    try {
      const details = await getTreinamentoDetails(id);
      setSelectedTreinamento(details);
    } catch (error) {
      console.error(error);
      setIsFormOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleNew = () => {
    setSelectedTreinamento(null);
    setIsFormOpen(true);
  };

  const handleSaveSuccess = () => {
    setIsFormOpen(false);
    fetchTreinamentos();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedTreinamentos();
      addToast('5 Treinamentos criados com sucesso!', 'success');
      fetchTreinamentos();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planejado': return 'bg-gray-100 text-gray-800';
      case 'agendado': return 'bg-blue-100 text-blue-800';
      case 'em_andamento': return 'bg-yellow-100 text-yellow-800';
      case 'concluido': return 'bg-green-100 text-green-800';
      case 'cancelado': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Treinamentos e Desenvolvimento</h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de capacitação e eficácia (ISO 9001: 7.2)</p>
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
              Novo Treinamento
            </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar treinamentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-w-[200px]"
        >
          <option value="">Todos os Status</option>
          <option value="planejado">Planejado</option>
          <option value="agendado">Agendado</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center h-64 items-center">
          <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {treinamentos.map(treino => (
            <GlassCard key={treino.id} className="p-6 flex flex-col justify-between hover:shadow-xl transition-shadow cursor-pointer border-l-4 border-l-orange-500" onClick={() => handleEdit(treino.id)}>
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-gray-800 line-clamp-1" title={treino.nome}>{treino.nome}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusColor(treino.status)}`}>
                    {getStatusLabel(treino.status)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <span className="capitalize bg-gray-100 px-2 py-0.5 rounded text-xs">{treino.tipo.replace(/_/g, ' ')}</span>
                  {treino.instrutor && <span className="text-xs border-l pl-2 border-gray-300">{treino.instrutor}</span>}
                </div>
                {treino.data_inicio && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                    <Calendar size={14} />
                    <span>{new Date(treino.data_inicio).toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-sm text-gray-500">
                <div className="flex items-center gap-1" title="Participantes">
                  <User size={16} />
                  <span>{treino.total_participantes || 0}</span>
                </div>
                <button className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                  <Edit size={14} /> Gerenciar
                </button>
              </div>
            </GlassCard>
          ))}
          {treinamentos.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              Nenhum treinamento encontrado.
            </div>
          )}
        </div>
      )}

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={selectedTreinamento ? 'Editar Treinamento' : 'Novo Treinamento'} size="4xl">
        {loadingDetails ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
          </div>
        ) : (
          <TreinamentoFormPanel treinamento={selectedTreinamento} onSaveSuccess={handleSaveSuccess} onClose={() => setIsFormOpen(false)} />
        )}
      </Modal>
    </div>
  );
}
