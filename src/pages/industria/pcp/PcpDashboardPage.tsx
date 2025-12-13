import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, BarChart3, BellRing, LineChart, Loader2, PackageSearch, RefreshCw, TrendingUp } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import {
  EstoqueProjetadoPoint,
  listPcpAtpCtp,
  listPcpCargaCapacidade,
  listPcpEstoqueProjetado,
  listPcpGantt,
  listPcpKpis,
  PcpAtpCtp,
  PcpCargaCapacidade,
  PcpGanttOperacao,
  PcpKpis
} from '@/services/industriaProducao';
import { differenceInCalendarDays, format } from 'date-fns';

const fmtInput = (date: Date) => date.toISOString().slice(0, 10);

const formatHours = (hours?: number | null) => {
  if (hours === null || hours === undefined) return '0 h';
  if (hours >= 24) {
    const dias = Math.floor(hours / 24);
    const resto = hours % 24;
    return `${dias}d ${resto.toFixed(0)}h`;
  }
  return `${hours.toFixed(1)} h`;
};

const formatPercent = (value?: number | null, digits = 1) => {
  if (value === null || value === undefined) return '0%';
  return `${value.toFixed(digits)}%`;
};

type AlertSeverity = 'critical' | 'warning';

interface PcpAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  helper?: string;
  actionLabel?: string;
  action?: () => void;
}


export default function PcpDashboardPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [carga, setCarga] = useState<PcpCargaCapacidade[]>([]);
  const [gantt, setGantt] = useState<PcpGanttOperacao[]>([]);
  const [kpis, setKpis] = useState<PcpKpis | null>(null);
  const [atpCtp, setAtpCtp] = useState<PcpAtpCtp[]>([]);
  const [selectedProdutoId, setSelectedProdutoId] = useState<string | null>(null);
  const [estoqueProjetado, setEstoqueProjetado] = useState<EstoqueProjetadoPoint[]>([]);
  const [estoqueLoading, setEstoqueLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(fmtInput(new Date(Date.now() - 3 * 24 * 3600 * 1000)));
  const [endDate, setEndDate] = useState(fmtInput(new Date(Date.now() + 7 * 24 * 3600 * 1000)));

  const loadData = async () => {
    setLoading(true);
    try {
      const [cargaData, ganttData, kpisData, atpData] = await Promise.all([
        listPcpCargaCapacidade(startDate, endDate),
        listPcpGantt(startDate, endDate),
        listPcpKpis(30),
        listPcpAtpCtp(endDate)
      ]);
      setCarga(cargaData);
      setGantt(ganttData);
      setKpis(kpisData);
      setAtpCtp(atpData);
      setSelectedProdutoId(prev => {
        if (prev && atpData.some(item => item.produto_id === prev)) {
          return prev;
        }
        return atpData[0]?.produto_id || null;
      });
      if (atpData.length === 0) {
        setEstoqueProjetado([]);
      }
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

  useEffect(() => {
    if (!selectedProdutoId) {
      setEstoqueProjetado([]);
      return;
    }
    setEstoqueLoading(true);
    listPcpEstoqueProjetado(selectedProdutoId)
      .then(setEstoqueProjetado)
      .catch((error: any) => addToast(error.message || 'Não foi possível carregar estoque projetado.', 'error'))
      .finally(() => setEstoqueLoading(false));
  }, [selectedProdutoId, addToast]);

  const capacitySummary = useMemo(() => {
    const map = new Map<string, {
      id: string;
      nome: string;
      totalCapacidade: number;
      totalCarga: number;
      totalSetup: number;
      totalProducao: number;
      totalExecucao: number;
      dias: PcpCargaCapacidade[];
      ratio: number;
    }>();

    carga.forEach(item => {
      const entry = map.get(item.centro_trabalho_id) || {
        id: item.centro_trabalho_id,
        nome: item.centro_trabalho_nome,
        totalCapacidade: 0,
        totalCarga: 0,
        totalSetup: 0,
        totalProducao: 0,
        totalExecucao: 0,
        dias: []
      };
      entry.totalCapacidade += item.capacidade_horas;
      entry.totalCarga += item.carga_total_horas;
      entry.totalSetup += item.carga_setup_horas;
      entry.totalProducao += item.carga_producao_horas;
      entry.totalExecucao += item.carga_em_execucao_horas;
      entry.dias.push(item);
      map.set(item.centro_trabalho_id, entry);
    });

    return Array.from(map.values())
      .map(entry => ({
        ...entry,
        ratio: entry.totalCapacidade > 0 ? entry.totalCarga / entry.totalCapacidade : 0
      }))
      .sort((a, b) => b.totalCarga - a.totalCarga);
  }, [carga]);

  const principalGargaloId = useMemo(() => {
    if (capacitySummary.length === 0) return null;
    const maisCritico = capacitySummary.reduce((prev, curr) => (curr.ratio > prev.ratio ? curr : prev));
    return maisCritico.id;
  }, [capacitySummary]);

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
        durationPercent,
        transferPercent: Math.min(item.transfer_ratio * 100, 100)
      };
    });
  }, [gantt, ganttRange]);

  const selectedProdutoInfo = useMemo(
    () => atpCtp.find(item => item.produto_id === selectedProdutoId) || null,
    [atpCtp, selectedProdutoId]
  );

  const estoqueGraph = useMemo(() => {
    if (!estoqueProjetado.length) {
      return { points: '', min: 0, max: 0 };
    }
    const valores = estoqueProjetado.map(p => p.saldo_projetado);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const range = max - min || 1;
    const points = estoqueProjetado.map((p, idx) => {
      const percentX = estoqueProjetado.length === 1 ? 0 : (idx / (estoqueProjetado.length - 1)) * 100;
      const percentY = 100 - ((p.saldo_projetado - min) / range) * 100;
      return `${percentX},${percentY}`;
    }).join(' ');
    return { points, min, max };
  }, [estoqueProjetado]);

  const rupturas = useMemo(
    () => estoqueProjetado.filter(p => p.saldo_projetado < 0),
    [estoqueProjetado]
  );

  const pcpAlerts = useMemo(() => {
    const alerts: PcpAlert[] = [];

    const overloadInfos = capacitySummary.map(ct => {
      const peak = ct.dias.reduce(
        (acc, dia) => {
          const ratioDia = dia.capacidade_horas > 0 ? dia.carga_total_horas / dia.capacidade_horas : 0;
          return ratioDia > acc.ratio ? { ratio: ratioDia, dia: dia.dia } : acc;
        },
        { ratio: 0, dia: ct.dias[0]?.dia }
      );
      return { ...ct, peakRatio: peak.ratio, peakDay: peak.dia };
    });

    const overloaded = overloadInfos.filter(info => info.peakRatio > 1.02);
    if (overloaded.length > 0) {
      const primary = overloaded[0];
      alerts.push({
        id: 'ct-overload',
        severity: 'critical',
        title: 'Capacidade excedida',
        description: `${primary.nome} está com ${Math.round(primary.peakRatio * 100)}% na data ${primary.peakDay ? format(new Date(primary.peakDay), 'dd/MM') : 'informada'}.`,
        helper: overloaded.length > 1 ? `+ ${overloaded.length - 1} centros também acima da capacidade.` : 'Reavalie sequenciamento ou redistribua carga.',
        actionLabel: 'Abrir Centros',
        action: () =>
          navigate({
            pathname: '/app/industria/centros-trabalho',
            search: `?focus=${encodeURIComponent(primary.nome)}`
          })
      });
    } else if (capacitySummary.length > 0 && capacitySummary[0].ratio > 0.85) {
      alerts.push({
        id: 'ct-near-limit',
        severity: 'warning',
        title: 'CT próximo do limite',
        description: `${capacitySummary[0].nome} opera a ${(capacitySummary[0].ratio * 100).toFixed(0)}% no período.`,
        helper: 'Considere antecipar setups ou mover ordens antes do pico.',
        actionLabel: 'Reprogramar PCP',
        action: () => navigate('/app/industria/pcp')
      });
    }

    const faltasAtp = atpCtp.filter(item => item.disponibilidade_atp < 0);
    if (faltasAtp.length > 0) {
      const produtoCritico = faltasAtp[0];
      alerts.push({
        id: 'atp-shortage',
        severity: 'critical',
        title: `Falta prevista em ${produtoCritico.produto_nome}`,
        description: `ATP está em ${produtoCritico.disponibilidade_atp.toLocaleString('pt-BR')} unidades.`,
        helper: produtoCritico.data_ctp
          ? `Capacidade só libera novamente em ${format(new Date(produtoCritico.data_ctp), 'dd/MM')}.`
          : 'Sugestão: gerar transferência ou RC imediata.',
        actionLabel: 'Abrir MRP',
        action: () =>
          navigate({
            pathname: '/app/industria/mrp',
            search: `?produtoId=${produtoCritico.produto_id}&produtoNome=${encodeURIComponent(produtoCritico.produto_nome)}`
          })
      });
    }

    if (rupturas.length > 0 && selectedProdutoInfo) {
      const primeira = rupturas[0];
      alerts.push({
        id: 'estoque-ruptura',
        severity: 'warning',
        title: 'Ruptura projetada',
        description: `${selectedProdutoInfo.produto_nome} ficará negativo em ${format(new Date(primeira.dia), 'dd/MM')}.`,
        helper: `Saldo previsto: ${primeira.saldo_projetado.toFixed(0)} unidades.`,
        actionLabel: 'Ver Estoque',
        action: () =>
          navigate({
            pathname: '/app/suprimentos/estoque',
            search: `?produto=${encodeURIComponent(selectedProdutoInfo.produto_nome)}`
          })
      });
    }

    return alerts;
  }, [capacitySummary, atpCtp, rupturas, selectedProdutoInfo, navigate]);

  const kpiCards = useMemo(() => [
    {
      label: 'OTIF (On Time In Full)',
      value: kpis ? formatPercent(kpis.otif_percent) : '—',
      helper: kpis ? `${kpis.ordens_concluidas} OPs concluídas` : 'Calculando...',
      trendColor: kpis && kpis.otif_percent >= 95 ? 'text-emerald-600' : 'text-amber-600'
    },
    {
      label: 'Lead time real',
      value: kpis ? formatHours(kpis.lead_time_real_horas) : '—',
      helper: kpis ? `Planejado: ${formatHours(kpis.lead_time_planejado_horas)}` : 'Planejado: —',
      trendColor:
        kpis && kpis.lead_time_real_horas > kpis.lead_time_planejado_horas ? 'text-red-600' : 'text-emerald-600'
    },
    {
      label: '% Refugo',
      value: kpis ? formatPercent(kpis.percentual_refugo) : '—',
      helper: 'Taxa média de refugo no período',
      trendColor: kpis && kpis.percentual_refugo > 3 ? 'text-red-600' : 'text-emerald-600'
    },
    {
      label: 'Aderência de ciclo',
      value: kpis ? formatPercent(kpis.aderencia_ciclo * 100, 0) : '—',
      helper: 'Lead time real ÷ padrão',
      trendColor: kpis && kpis.aderencia_ciclo <= 1 ? 'text-emerald-600' : 'text-amber-600'
    }
  ], [kpis]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="text-emerald-600" /> PCP - Visão integrada
          </h1>
          <p className="text-sm text-gray-500">
            Acompanhe gargalos, transferências OVERLAP e disponibilidade (ATP/CTP) em um único lugar.
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

      {pcpAlerts.length > 0 && (
        <section className="bg-white border rounded-lg shadow-sm">
          <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
            <BellRing className="text-amber-500" size={18} /> Alertas operacionais
          </div>
          <div className="divide-y">
            {pcpAlerts.map(alert => {
              const color =
                alert.severity === 'critical'
                  ? 'text-red-600 bg-red-50 border-red-200'
                  : 'text-amber-600 bg-amber-50 border-amber-200';
              return (
                <div key={alert.id} className={`flex gap-3 px-4 py-3 border-l-4 ${color}`}>
                  <AlertTriangle size={18} className="mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{alert.title}</p>
                    <p className="text-sm text-gray-700">{alert.description}</p>
                    {alert.helper && <p className="text-xs text-gray-500 mt-1">{alert.helper}</p>}
                  </div>
                  {alert.action && alert.actionLabel && (
                    <button
                      onClick={alert.action}
                      className="self-center text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline-offset-2 hover:underline"
                    >
                      {alert.actionLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(card => (
          <div key={card.label} className="bg-white border rounded-lg shadow-sm p-4 relative">
            <Activity className="text-blue-400 absolute right-4 top-4" size={18} />
            <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className={`text-2xl font-semibold mt-2 ${card.trendColor}`}>{card.value}</p>
            <p className="text-xs text-gray-500 mt-2">{card.helper}</p>
          </div>
        ))}
      </section>

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
              const ratio = ct.ratio;
              const gargaloSevero = ratio > 1;
              const isPrincipal = principalGargaloId === ct.id;
              return (
                <div key={ct.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Centro de Trabalho</p>
                      <h3 className="text-lg font-semibold text-gray-900">{ct.nome}</h3>
                    </div>
                    {(gargaloSevero || isPrincipal) && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full ${
                          gargaloSevero ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'
                        }`}
                      >
                        <AlertTriangle size={14} />
                        {gargaloSevero ? 'Gargalo' : 'Maior carga'}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-6">
                    <div>
                      <p className="text-gray-500">Capacidade total</p>
                      <p className="text-gray-900 font-semibold">{ct.totalCapacidade.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Carga total</p>
                      <p className="text-gray-900 font-semibold">{ct.totalCarga.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Utilização</p>
                      <p className={`font-semibold ${gargaloSevero ? 'text-red-600' : 'text-green-600'}`}>
                        {(ratio * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Setup</p>
                      <p className="text-gray-900 font-semibold">{ct.totalSetup.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Produção</p>
                      <p className="text-gray-900 font-semibold">{ct.totalProducao.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Em execução</p>
                      <p className="text-gray-900 font-semibold">{ct.totalExecucao.toFixed(1)} h</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {ct.dias.slice(0, 7).map(dia => {
                      const dayRatio = dia.capacidade_horas > 0 ? dia.carga_total_horas / dia.capacidade_horas : 0;
                      const totalDia = dia.carga_total_horas;
                      const basePercent =
                        dia.capacidade_horas > 0 ? Math.min((totalDia / dia.capacidade_horas) * 100, 100) : 0;
                      const setupPercent =
                        totalDia > 0 ? basePercent * (dia.carga_setup_horas / Math.max(totalDia, 0.0001)) : 0;
                      const prodPercent = Math.max(basePercent - setupPercent, 0);
                      const excedentePercent =
                        dia.capacidade_horas > 0 && totalDia > dia.capacidade_horas
                          ? Math.min(((totalDia - dia.capacidade_horas) / dia.capacidade_horas) * 100, 100)
                          : 0;
                      return (
                        <div key={`${ct.id}-${dia.dia}`} className="text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">{format(new Date(dia.dia), 'dd/MM')}</span>
                            <span className={dayRatio > 1 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                              {dia.carga_total_horas.toFixed(1)} / {dia.capacidade_horas.toFixed(1)} h
                            </span>
                          </div>
                          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-amber-400"
                              style={{ width: `${setupPercent}%` }}
                            ></div>
                            <div
                              className="absolute inset-y-0 bg-blue-500"
                              style={{
                                width: `${prodPercent}%`,
                                left: `${setupPercent}%`
                              }}
                            ></div>
                            {excedentePercent > 0 && (
                              <div
                                className="absolute inset-y-0 right-0 bg-red-500/60"
                                style={{ width: `${Math.min(excedentePercent, 100)}%` }}
                              ></div>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">
                            Setup {dia.carga_setup_horas.toFixed(1)} h • Produção {dia.carga_producao_horas.toFixed(1)} h
                          </p>
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
                          className="absolute inset-y-0 rounded-full overflow-hidden"
                          style={{
                            left: `${Math.max(item.offsetPercent, 0)}%`,
                            width: `${Math.min(item.durationPercent, 100)}%`
                          }}
                        >
                          <div className="h-full w-full bg-gradient-to-r from-purple-500 to-purple-700 relative">
                            {item.permite_overlap && (
                              <div className="absolute inset-0 border-2 border-dashed border-white/50 rounded-full pointer-events-none"></div>
                            )}
                            {item.transfer_ratio > 0 && (
                              <div
                                className="absolute top-0 left-0 h-full bg-white/40"
                                style={{ width: `${item.transferPercent}%` }}
                              ></div>
                            )}
                          </div>
                        </div>
                      </div>
                      {(item.quantidade_transferida > 0 || item.permite_overlap) && (
                        <p className="text-[11px] text-gray-500 mt-1 flex justify-between">
                          {item.permite_overlap && <span>OVERLAP ativo</span>}
                          {item.quantidade_transferida > 0 && (
                            <span>
                              Transferido: {item.quantidade_transferida} ({Math.round(item.transfer_ratio * 100)}%)
                            </span>
                          )}
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

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
          <PackageSearch className="text-emerald-600" size={18} /> ATP / CTP por produto
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">Produto</th>
                <th className="px-4 py-2 text-right">Estoque</th>
                <th className="px-4 py-2 text-right">Em produção</th>
                <th className="px-4 py-2 text-right">Demanda</th>
                <th className="px-4 py-2 text-right">ATP</th>
                <th className="px-4 py-2 text-right">Carga pendente (h)</th>
                <th className="px-4 py-2 text-left">Data CTP</th>
              </tr>
            </thead>
            <tbody>
              {atpCtp.map(item => {
                const falta = item.disponibilidade_atp < 0;
                return (
                  <tr key={item.produto_id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedProdutoId(item.produto_id)}>
                    <td className="px-4 py-2 text-gray-900 font-medium">{item.produto_nome}</td>
                    <td className="px-4 py-2 text-right">{item.estoque_atual.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right">{item.em_producao.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right">{item.demanda_confirmada.toLocaleString('pt-BR')}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${falta ? 'text-red-600' : 'text-emerald-600'}`}>
                      {item.disponibilidade_atp.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2 text-right">{item.carga_horas_pendente.toFixed(1)}</td>
                    <td className="px-4 py-2 text-left">
                      {item.data_ctp ? format(new Date(item.data_ctp), 'dd/MM') : '—'}
                    </td>
                  </tr>
                );
              })}
              {atpCtp.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-500 py-6">
                    Sem itens com cálculo ATP/CTP para o período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between text-gray-700 font-semibold">
          <div className="flex items-center gap-2">
            <LineChart className="text-sky-600" size={18} /> Estoque projetado
          </div>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={selectedProdutoId || ''}
            onChange={(e) => setSelectedProdutoId(e.target.value || null)}
            disabled={atpCtp.length === 0}
          >
            <option value="">Selecione um produto</option>
            {atpCtp.map(item => (
              <option key={item.produto_id} value={item.produto_id}>
                {item.produto_nome}
              </option>
            ))}
          </select>
        </div>
        <div className="p-4 flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            {!selectedProdutoId ? (
              <p className="text-sm text-gray-500">Escolha um produto para visualizar a curva projetada.</p>
            ) : estoqueLoading ? (
              <div className="h-48 flex items-center justify-center text-blue-600 gap-2">
                <Loader2 className="animate-spin" /> Gerando curva...
              </div>
            ) : estoqueProjetado.length === 0 ? (
              <p className="text-sm text-gray-500">Sem dados de estoque projetado.</p>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-48">
                    {estoqueGraph.points && (
                      <polyline
                        points={estoqueGraph.points}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>Min: {estoqueGraph.min.toFixed(0)}</span>
                    <span>Max: {estoqueGraph.max.toFixed(0)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {estoqueProjetado.slice(0, 7).map(ponto => (
                    <div key={ponto.dia} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{format(new Date(ponto.dia), 'dd/MM')}</span>
                      <span className={ponto.saldo_projetado < 0 ? 'text-red-600 font-semibold' : 'text-gray-800'}>
                        {ponto.saldo_projetado.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="w-full lg:w-72 bg-gray-50 rounded-lg p-4 space-y-4">
            {selectedProdutoInfo ? (
              <>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Produto</p>
                  <p className="text-sm font-semibold text-gray-900">{selectedProdutoInfo.produto_nome}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Estoque atual</p>
                    <p className="font-semibold text-gray-900">{selectedProdutoInfo.estoque_atual.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">ATP</p>
                    <p
                      className={`font-semibold ${
                        selectedProdutoInfo.disponibilidade_atp < 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {selectedProdutoInfo.disponibilidade_atp.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-gray-600">
                  {rupturas.length > 0 ? (
                    <p className="text-red-600 font-semibold">
                      Ruptura prevista em {format(new Date(rupturas[0].dia), 'dd/MM')} ({rupturas[0].saldo_projetado.toFixed(0)})
                    </p>
                  ) : (
                    <p>Nenhuma ruptura prevista nos próximos dias.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Clique em um item do ATP para ver detalhes.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
