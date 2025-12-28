import React, { useState, useEffect } from 'react';
import { getCompetencyMatrix, MatrixRow, listCargos, Cargo } from '@/services/rh';
import { Loader2, Filter, AlertCircle, TrendingUp, TrendingDown, Minus, Grid } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Select from '@/components/ui/forms/Select';
import PageHeader from '@/components/ui/PageHeader';
import { useToast } from '@/contexts/ToastProvider';

export default function MatrizCompetenciasPage() {
  const { addToast } = useToast();
  const [matrixData, setMatrixData] = useState<MatrixRow[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [selectedCargo, setSelectedCargo] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const data = await listCargos(undefined, true); // Only active cargos
        setCargos(data);
      } catch (e) {
        addToast((e as any)?.message || 'Erro ao carregar cargos.', 'error');
      }
    };
    loadFilters();
  }, [addToast]);

  useEffect(() => {
    const fetchMatrix = async () => {
      setLoading(true);
      try {
        const data = await getCompetencyMatrix(selectedCargo || undefined);
        setMatrixData(data);
      } catch (error) {
        addToast((error as any)?.message || 'Erro ao carregar matriz de competências.', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchMatrix();
  }, [selectedCargo, addToast]);

  // Extract all unique competencies to build columns
  const allCompetencies = React.useMemo(() => {
    const comps = new Map<string, { id: string; nome: string; tipo: string }>();
    matrixData.forEach((row) => {
      const competencias = Array.isArray(row.competencias) ? row.competencias : [];
      competencias.forEach((c) => {
        comps.set(c.id, { id: c.id, nome: c.nome, tipo: c.tipo });
      });
    });
    return Array.from(comps.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [matrixData]);

  const renderCell = (row: MatrixRow, compId: string) => {
    const competencias = Array.isArray(row.competencias) ? row.competencias : [];
    const comp = competencias.find((c) => c.id === compId);
    
    if (!comp) {
      return <div className="h-full w-full bg-gray-50/50"></div>;
    }

    // Lógica de Cores ISO 9001 (Gap Analysis)
    let bgColor = 'bg-gray-100';
    let textColor = 'text-gray-500';
    let icon = null;

    if (comp.nivel_requerido > 0) {
        if (comp.gap >= 0) {
            bgColor = 'bg-green-100';
            textColor = 'text-green-800';
            icon = <TrendingUp size={12} />;
        } else {
            bgColor = 'bg-red-100';
            textColor = 'text-red-800';
            icon = <TrendingDown size={12} />;
        }
    } else {
        // Competência extra (não requerida, mas avaliada)
        bgColor = 'bg-blue-50';
        textColor = 'text-blue-600';
        icon = <Minus size={12} className="rotate-90" />;
    }

    return (
      <div className={`h-full w-full p-2 flex flex-col items-center justify-center text-xs border-r border-b border-gray-100 ${bgColor} ${textColor}`}>
        <div className="font-bold text-sm flex items-center gap-1">
            {comp.nivel_atual}
            {icon}
        </div>
        {comp.nivel_requerido > 0 && (
            <span className="opacity-70 text-[10px]">Meta: {comp.nivel_requerido}</span>
        )}
      </div>
    );
  };

  return (
    <div className="p-1 h-full flex flex-col gap-6">
      <PageHeader
        title="Matriz de Competências"
        description="Análise de GAPs e conformidade ISO 9001."
        icon={<Grid className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400" size={18} />
            <Select
              value={selectedCargo}
              onChange={(e) => setSelectedCargo(e.target.value)}
              className="min-w-[240px]"
            >
              <option value="">Todos os Cargos</option>
              {cargos.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
          </div>
        }
      />

      {loading ? (
        <div className="flex-grow flex justify-center items-center">
          <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
        </div>
      ) : matrixData.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center text-gray-500">
          <AlertCircle size={48} className="mb-4 text-gray-300" />
          <p className="text-lg">Nenhum dado encontrado.</p>
          <p className="text-sm">Cadastre colaboradores e avalie suas competências para visualizar a matriz.</p>
        </div>
      ) : (
        <GlassCard className="flex-grow overflow-hidden flex flex-col p-0">
          <div className="overflow-auto scrollbar-styled flex-grow">
            <table className="min-w-full border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 min-w-[200px] sticky left-0 bg-gray-50 z-20">
                    Colaborador / Cargo
                  </th>
                  {allCompetencies.map(comp => (
                    <th key={comp.id} className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-r border-gray-200 min-w-[100px]">
                      <div className="line-clamp-2" title={comp.nome}>{comp.nome}</div>
                      <span className="text-[10px] text-gray-400 font-normal capitalize">{comp.tipo}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {matrixData.map(row => (
                  <tr key={row.colaborador_id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 whitespace-nowrap border-r border-gray-200 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="font-semibold text-gray-800">{row.colaborador_nome}</div>
                      <div className="text-xs text-gray-500">{row.cargo_nome}</div>
                    </td>
                    {allCompetencies.map(comp => (
                      <td key={comp.id} className="p-0 h-16 align-middle">
                        {renderCell(row, comp.id)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-6 text-xs text-gray-600">
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-100 border border-green-200 rounded-sm"></span>
                <span>Atende ao Requisito</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm"></span>
                <span>Gap de Competência (Treinamento Necessário)</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-blue-50 border border-blue-100 rounded-sm"></span>
                <span>Competência Extra (Não exigida)</span>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
