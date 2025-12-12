import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { listPcpCargaCapacidade, listPcpGantt, PcpCargaCapacidade, PcpGanttOperacao } from '@/services/industriaProducao';
import { differenceInCalendarDays, format } from 'date-fns';

const fmtInput = (date: Date) => date.toISOString().slice(0, 10);

export default function PcpDashboardPage() {
  const { addToast } = useToast();
  const [carga, setCarga] = useState<PcpCargaCapacidade[]>([]);
  const [gantt, setGantt] = useState<PcpGanttOperacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(fmtInput(new Date(Date.now() - 3 * 24 * 3600 * 1000)));
  const [endDate, setEndDate] = useState(fmtInput(new Date(Date.now() + 7 * 24 * 3600 * 1000)));

  const loadData = async () => {
    setLoading(true);
    try {
      const [cargaData, ganttData] = await Promise.all([
        listPcpCargaCapacidade(startDate, endDate),
        listPcpGantt(startDate, endDate)
      ]);
      setCarga(cargaData);
      setGantt(ganttData);
    } catch (error: any) {
      addToast(error.message || 'Não foi possível carregar PCP.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capacitySummary = useMemo(() => {
    const map = new Map<string, {
      id: string;
      nome: string;
      totalCapacidade: number;
      totalCarga: number;
      dias: PcpCargaCapacidade[];
    }>();

    carga.forEach(item => {
      const entry = map.get(item.centro_trabalho_id) || {
        id: item.centro_trabalho_id,
        nome: item.centro_trabalho_nome,
        totalCapacidade: 0,
        totalCarga: 0,
        dias: []
      };
      entry.totalCapacidade += item.capacidade_horas;
      entry.totalCarga += item.carga_planejada_horas;
      entry.dias.push(item);
      map.set(item.centro_trabalho_id, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.totalCarga - a.totalCarga);
  }, [carga]);

  const ganttRange = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.max(differenceInCalendarDays(end, start), 1);
    return { start, end, totalDays };
  }, [startDate, endDate]);

  const ganttRows = useMemo(() => {
    return gantt.map(item => {
      const start = new Date(item.data_inicio);
      const end = new Date(item.data_fim);
      const startOffset = differenceInCalendarDays(start, ganttRange.start);
      const duration = Math.max(differenceInCalendarDays(end, start) + 1, 1);
      const offsetPercent = Math.max((startOffset / ganttRange.totalDays) * 100, 0);
      const durationPercent = Math.min((duration / ganttRange.totalDays) * 100, 100);
      return {
        ...item,
        offsetPercent,
        durationPercent
      };
    });
  }, [gantt, ganttRange]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="text-emerald-600" /> PCP - Carga & Gantt
          </h1>
          <p className="text-sm text-gray-500">
            Acompanhe gargalos por centro de trabalho e visualize as ordens ao longo do plano.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
          <BarChart3 className="text-blue-600" size={18} /> Carga x Capacidade
        </div>
        {loading && carga.length === 0 ? (
          <div className="py-10 flex items-center justify-center text-blue-600 gap-2">
            <Loader2 className="animate-spin" /> Calculando...
          </div>
        ) : (
          <div className="p-4 grid gap-4 md:grid-cols-2">
            {capacitySummary.map(ct => {
              const ratio = ct.totalCapacidade > 0 ? ct.totalCarga / ct.totalCapacidade : 0;
              const gargalo = ratio > 1;
              return (
                <div key={ct.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Centro de Trabalho</p>
                      <h3 className="text-lg font-semibold text-gray-900">{ct.nome}</h3>
                    </div>
                    {gargalo && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1 rounded-full">
                        <AlertTriangle size={14} />
                        Gargalo
                      </span>
                    )}
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-gray-500">Capacidade total</p>
                      <p className="text-gray-900 font-semibold">{ct.totalCapacidade.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Carga planejada</p>
                      <p className="text-gray-900 font-semibold">{ct.totalCarga.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Utilização</p>
                      <p className={`font-semibold ${gargalo ? 'text-red-600' : 'text-green-600'}`}>
                        {(ratio * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {ct.dias.slice(0, 7).map(dia => {
                      const dayRatio = dia.capacidade_horas > 0 ? dia.carga_planejada_horas / dia.capacidade_horas : 0;
                      return (
                        <div key={`${ct.id}-${dia.dia}`} className="text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">{format(new Date(dia.dia), 'dd/MM')}</span>
                            <span className={dayRatio > 1 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                              {dia.carga_planejada_horas.toFixed(1)} / {dia.capacidade_horas.toFixed(1)} h
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${dayRatio > 1 ? 'bg-red-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(dayRatio * 100, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {capacitySummary.length === 0 && (
              <div className="col-span-full text-center text-gray-500 py-8">
                Nenhum centro de trabalho com carga planejada neste período.
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
          <BarChart3 className="text-purple-600" size={18} /> Gantt simplificado
        </div>
        {loading && gantt.length === 0 ? (
          <div className="py-10 flex items-center justify-center text-blue-600 gap-2">
            <Loader2 className="animate-spin" /> Carregando ordens...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">OP</th>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-left">CT / Seq</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left w-2/5">Linha do tempo</th>
                </tr>
              </thead>
              <tbody>
                {ganttRows.map(item => (
                  <tr key={item.operacao_id} className="border-t">
                    <td className="px-4 py-2 font-medium text-gray-800">OP #{item.ordem_numero}</td>
                    <td className="px-4 py-2 text-gray-700">{item.produto_nome}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {item.centro_trabalho_nome || '—'}
                      <span className="ml-1 text-xs text-gray-500">seq {item.operacao_sequencia}</span>
                      {item.permite_overlap && (
                        <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">Overlap</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        item.status_operacao === 'concluida'
                          ? 'bg-green-100 text-green-700'
                          : item.status_operacao === 'em_execucao'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                        {item.status_operacao}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-500 flex justify-between mb-1">
                        <span>{format(new Date(item.data_inicio), 'dd/MM')}</span>
                        <span>{format(new Date(item.data_fim), 'dd/MM')}</span>
                      </div>
                      <div className="relative bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="absolute h-full bg-gradient-to-r from-purple-500 to-purple-700 rounded-full"
                          style={{
                            left: `${Math.max(item.offsetPercent, 0)}%`,
                            width: `${Math.min(item.durationPercent, 100)}%`
                          }}
                        ></div>
                      </div>
                      {item.quantidade_transferida > 0 && (
                        <p className="text-[11px] text-gray-500 mt-1">
                          Transferido: {item.quantidade_transferida}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
                {ganttRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-500 py-6">Nenhuma OP encontrada no período selecionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
