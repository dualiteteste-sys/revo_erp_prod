import React, { useState, useEffect } from 'react';
import { listOperacoes, Operacao } from '@/services/industriaExecucao';
import { listCentrosTrabalho, CentroTrabalho } from '@/services/industriaCentros';
import { Search, LayoutGrid, List, PlayCircle } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Select from '@/components/ui/forms/Select';
import OperacoesTable from '@/components/industria/execucao/OperacoesTable';
import OperacoesKanbanBoard from '@/components/industria/execucao/OperacoesKanbanBoard';

export default function ExecucaoPage() {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [centros, setCentros] = useState<CentroTrabalho[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [centroFilter, setCentroFilter] = useState('');
  
  const debouncedSearch = useDebounce(search, 500);

  useEffect(() => {
    listCentrosTrabalho(undefined, true).then(setCentros);
  }, []);

  const fetchOperacoes = async () => {
    if (viewMode === 'kanban') return;
    setLoading(true);
    try {
      const data = await listOperacoes('lista', centroFilter || undefined, statusFilter || undefined, debouncedSearch);
      setOperacoes(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperacoes();
  }, [debouncedSearch, statusFilter, centroFilter, viewMode]);

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <PlayCircle className="text-blue-600" /> Execução de Operações
          </h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de ordens de trabalho e status.</p>
        </div>
        <div className="bg-gray-100 p-1 rounded-lg flex">
            <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Lista"
            >
                <List size={20} />
            </button>
            <button 
                onClick={() => setViewMode('kanban')}
                className={`p-2 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Kanban"
            >
                <LayoutGrid size={20} />
            </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4 flex-shrink-0 flex-wrap">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por ordem, produto ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select
          value={centroFilter}
          onChange={(e) => setCentroFilter(e.target.value)}
          className="min-w-[200px]"
        >
          <option value="">Todos os Centros</option>
          {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-w-[200px]"
        >
          <option value="">Todos os Status</option>
          <option value="planejada">Planejada</option>
          <option value="liberada">Liberada</option>
          <option value="em_execucao">Em Execução</option>
          <option value="em_espera">Em Espera</option>
          <option value="em_inspecao">Em Inspeção</option>
          <option value="concluida">Concluída</option>
        </Select>
      </div>

      <div className="flex-grow overflow-hidden">
        {viewMode === 'list' ? (
            <div className="bg-white rounded-lg shadow overflow-hidden h-full overflow-y-auto">
                {loading ? (
                <div className="flex justify-center h-64 items-center">
                    <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
                </div>
                ) : (
                <OperacoesTable operacoes={operacoes} onUpdateStatus={() => {}} />
                )}
            </div>
        ) : (
            <OperacoesKanbanBoard centroId={centroFilter} search={debouncedSearch} />
        )}
      </div>
    </div>
  );
}
