import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getDashboardStats, DashboardStats, listOrdens, type OrdemIndustria } from '@/services/industria';
import { AlertCircle, CheckCircle, Factory, RefreshCw, Activity, Eye, ShieldAlert } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { logger } from '@/lib/logger';
import { formatOrderNumber } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

export default function IndustriaDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prodOrders, setProdOrders] = useState<OrdemIndustria[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);
  const [benefOrders, setBenefOrders] = useState<OrdemIndustria[]>([]);
  const [benefLoading, setBenefLoading] = useState(false);
  const [benefError, setBenefError] = useState<string | null>(null);
  const [atrasosSort, setAtrasosSort] = useState<SortState<'tipo' | 'ordem' | 'cliente' | 'prev' | 'status'>>({ column: 'prev', direction: 'asc' });
  const [benefSort, setBenefSort] = useState<SortState<'itens' | 'caixas' | 'op' | 'cliente' | 'nfCliente' | 'nf' | 'pedido' | 'entrada' | 'saldo'>>({ column: 'saldo', direction: 'desc' });

  const atrasosColumns: TableColumnWidthDef[] = [
    { id: 'tipo', defaultWidth: 90, minWidth: 80 },
    { id: 'ordem', defaultWidth: 130, minWidth: 110 },
    { id: 'cliente', defaultWidth: 240, minWidth: 200 },
    { id: 'prev', defaultWidth: 150, minWidth: 130 },
    { id: 'status', defaultWidth: 180, minWidth: 150 },
  ];
  const { widths: atrasosWidths, startResize: startAtrasosResize } = useTableColumnWidths({
    tableId: 'industria:dashboard:atrasos',
    columns: atrasosColumns,
  });

  const benefColumns: TableColumnWidthDef[] = [
    { id: 'itens', defaultWidth: 160, minWidth: 140 },
    { id: 'caixas', defaultWidth: 140, minWidth: 120 },
    { id: 'op', defaultWidth: 120, minWidth: 110 },
    { id: 'cliente', defaultWidth: 220, minWidth: 180 },
    { id: 'nfCliente', defaultWidth: 160, minWidth: 140 },
    { id: 'nf', defaultWidth: 160, minWidth: 140 },
    { id: 'pedido', defaultWidth: 140, minWidth: 120 },
    { id: 'entrada', defaultWidth: 160, minWidth: 140 },
    { id: 'saldo', defaultWidth: 170, minWidth: 150 },
  ];
  const { widths: benefWidths, startResize: startBenefResize } = useTableColumnWidths({
    tableId: 'industria:dashboard:benef-top',
    columns: benefColumns,
  });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardStats();
      // Validação básica para garantir que não recebemos null/undefined
      if (!data) throw new Error("Dados não recebidos do servidor.");
      setStats(data);
    } catch (err: any) {
      logger.error('[Indústria][Dashboard] Erro ao carregar dashboard', err);
      // Tratamento de erro amigável
      setError(err.message || "Não foi possível carregar os dados do dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBenefOrdens = useCallback(async () => {
    setBenefLoading(true);
    setBenefError(null);
    try {
      const data = await listOrdens('', 'beneficiamento', '');
      setBenefOrders(data || []);
    } catch (err: any) {
      logger.error('[Indústria][Dashboard] Falha ao carregar beneficiamento', err);
      setBenefError(err.message || 'Erro ao carregar ordens de beneficiamento.');
    } finally {
      setBenefLoading(false);
    }
  }, []);

  const fetchProdOrdens = useCallback(async () => {
    setProdLoading(true);
    setProdError(null);
    try {
      const data = await listOrdens('', 'industrializacao', '');
      setProdOrders(data || []);
    } catch (err: any) {
      logger.error('[Indústria][Dashboard] Falha ao carregar produção', err);
      setProdError(err.message || 'Erro ao carregar ordens de produção.');
    } finally {
      setProdLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchBenefOrdens();
  }, [fetchBenefOrdens]);

  useEffect(() => {
    fetchProdOrdens();
  }, [fetchProdOrdens]);

  // Cálculos seguros com Nullish Coalescing (??) para evitar crash
  const totalProducao = stats?.total_producao ?? 0;
  const producaoStatus = stats?.producao_status ?? [];
  const beneficiamentoStatus = stats?.beneficiamento_status ?? [];

  const chartDataStatus = producaoStatus.map(s => ({
    value: Number(s.total),
    name: s.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }));

  const statusChartOption = {
    title: { text: 'Ordens de Produção por Status', left: 'center', textStyle: { fontSize: 14, color: '#4b5563' } },
    tooltip: { trigger: 'item' },
    legend: { bottom: '0%' },
    series: [
      {
        name: 'Status',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
        data: chartDataStatus.length > 0 ? chartDataStatus : [{ value: 0, name: 'Sem dados' }]
      }
    ]
  };

  const barChartOption = {
    title: { text: 'Pipeline de Produção', left: 'center', textStyle: { fontSize: 14, color: '#4b5563' } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: producaoStatus.map(s => s.status.replace(/_/g, ' ')),
      axisLabel: { rotate: 20 }
    },
    yAxis: { type: 'value' },
    series: [
      {
        data: producaoStatus.map(s => Number(s.total)),
        type: 'bar',
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top' }
      }
    ]
  };

  const benefStatusData = beneficiamentoStatus.map(s => ({
    value: Number(s.total),
    name: s.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }));

  const benefStatusChartOption = {
    title: { text: 'Beneficiamento por Status', left: 'center', textStyle: { fontSize: 14, color: '#4b5563' } },
    tooltip: { trigger: 'item' },
    legend: { bottom: '0%' },
    series: [
      {
        name: 'Status',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
        data: benefStatusData.length > 0 ? benefStatusData : [{ value: 0, name: 'Sem dados' }]
      }
    ]
  };

  const benefPipelineChartOption = {
    title: { text: 'Pipeline de Beneficiamento', left: 'center', textStyle: { fontSize: 14, color: '#4b5563' } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: beneficiamentoStatus.map(s => s.status.replace(/_/g, ' ')),
      axisLabel: { rotate: 20 }
    },
    yAxis: { type: 'value' },
    series: [
      {
        data: beneficiamentoStatus.map(s => Number(s.total)),
        type: 'bar',
        itemStyle: { color: '#06b6d4', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top' }
      }
    ]
  };

  // KPI Calculations (Safe)
  const concluidasProd = producaoStatus.find(s => s.status === 'concluida')?.total ?? 0;
  const emProducao = producaoStatus.find(s => s.status === 'em_producao')?.total ?? 0;
  const totalConcluidas = concluidasProd;
  
  // Eficiência (Exemplo simples: Concluídas / Total)
  const eficiencia = totalProducao > 0 ? Math.round((totalConcluidas / totalProducao) * 100) : 0;

  const count = useCallback((arr: { status: string; total: number }[], key: string) => {
    return Number(arr.find(s => s.status === key)?.total ?? 0);
  }, []);

  const wipCards = useMemo(() => {
    const keys = [
      { key: 'em_programacao', label: 'Em Programação', color: 'bg-amber-100 text-amber-700' },
      { key: 'em_producao', label: 'Em Produção', color: 'bg-blue-100 text-blue-700' },
      { key: 'em_inspecao', label: 'Em Inspeção', color: 'bg-purple-100 text-purple-700' },
      { key: 'em_beneficiamento', label: 'Em Beneficiamento', color: 'bg-cyan-100 text-cyan-700' },
      { key: 'parcialmente_concluida', label: 'Parcialmente Concluída', color: 'bg-emerald-100 text-emerald-700' },
    ];
    return keys.map(k => ({
      ...k,
      total: count(producaoStatus, k.key) + count(beneficiamentoStatus, k.key),
    }));
  }, [beneficiamentoStatus, producaoStatus, count]);

  const qaPendente = count(producaoStatus, 'em_inspecao') + count(beneficiamentoStatus, 'em_inspecao');

  const benefEmAndamento = useMemo(
    () => benefOrders.filter(o => o.status !== 'concluida' && o.status !== 'cancelada'),
    [benefOrders]
  );

  const benefTop = useMemo(() => benefEmAndamento.slice(0, 8), [benefEmAndamento]);
  const benefTopSorted = useMemo(() => {
    return sortRows(
      benefTop,
      benefSort as any,
      [
        { id: 'itens', type: 'number', getValue: (o: OrdemIndustria) => o.quantidade_planejada ?? 0 },
        { id: 'caixas', type: 'number', getValue: (o: OrdemIndustria) => Number(o.qtde_caixas ?? 0) },
        { id: 'op', type: 'number', getValue: (o: OrdemIndustria) => o.numero ?? 0 },
        { id: 'cliente', type: 'string', getValue: (o: OrdemIndustria) => o.cliente_nome ?? '' },
        { id: 'nfCliente', type: 'number', getValue: (o: OrdemIndustria) => o.total_entregue ?? 0 },
        { id: 'nf', type: 'string', getValue: (o: OrdemIndustria) => o.numero_nf || o.documento_ref || '' },
        { id: 'pedido', type: 'string', getValue: (o: OrdemIndustria) => o.pedido_numero ?? '' },
        { id: 'entrada', type: 'date', getValue: (o: OrdemIndustria) => o.created_at || o.data_prevista_inicio || '' },
        { id: 'saldo', type: 'number', getValue: (o: OrdemIndustria) => Math.max((o.quantidade_planejada ?? 0) - (o.total_entregue ?? 0), 0) },
      ] as const
    );
  }, [benefSort, benefTop]);

  const ordensAtrasadas = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const isLate = (o: OrdemIndustria) => {
      const d = o.data_prevista_entrega ? new Date(`${o.data_prevista_entrega}T00:00:00`) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      return d < now && o.status !== 'concluida' && o.status !== 'cancelada';
    };
    const late = [...prodOrders, ...benefOrders].filter(isLate);
    late.sort((a, b) => {
      const da = a.data_prevista_entrega || '';
      const db = b.data_prevista_entrega || '';
      return da.localeCompare(db);
    });
    return late.slice(0, 10);
  }, [prodOrders, benefOrders]);
  const ordensAtrasadasSorted = useMemo(() => {
    return sortRows(
      ordensAtrasadas,
      atrasosSort as any,
      [
        { id: 'tipo', type: 'string', getValue: (o: OrdemIndustria) => o.tipo_ordem ?? '' },
        { id: 'ordem', type: 'number', getValue: (o: OrdemIndustria) => o.numero ?? 0 },
        { id: 'cliente', type: 'string', getValue: (o: OrdemIndustria) => o.cliente_nome ?? '' },
        { id: 'prev', type: 'date', getValue: (o: OrdemIndustria) => o.data_prevista_entrega ?? '' },
        { id: 'status', type: 'string', getValue: (o: OrdemIndustria) => o.status ?? '' },
      ] as const
    );
  }, [atrasosSort, ordensAtrasadas]);

  const benefSaldoPorCliente = useMemo(() => {
    const map: Record<string, number> = {};
    benefEmAndamento.forEach(o => {
      const key = o.cliente_nome || 'Sem cliente';
      const saldo = Math.max((o.quantidade_planejada ?? 0) - (o.total_entregue ?? 0), 0);
      map[key] = (map[key] || 0) + saldo;
    });
    return Object.entries(map).map(([cliente, saldo]) => ({ cliente, saldo }));
  }, [benefEmAndamento]);

  const benefChartOption = {
    title: { text: 'Saldo por Cliente (Beneficiamento)', left: 'center', textStyle: { fontSize: 14, color: '#4b5563' } },
    tooltip: { trigger: 'axis' },
    grid: { left: '6%', right: '4%', bottom: 50, containLabel: true },
    xAxis: {
      type: 'category',
      data: benefSaldoPorCliente.map(i => i.cliente),
      axisLabel: {
        interval: 0,
        rotate: 0,
        fontSize: 11,
        margin: 14,
        formatter: (value: string) => {
          const chunks = value.match(/.{1,18}/g);
          return chunks ? chunks.join('\n') : value;
        },
      },
    },
    yAxis: { type: 'value' },
    series: [
      {
        data: benefSaldoPorCliente.map(i => i.saldo),
        type: 'bar',
        itemStyle: { color: '#06b6d4', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top' }
      }
    ]
  };

  // UI de Carregamento (Skeleton)
  if (loading) {
    return (
      <div className="p-1 space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded mb-2"></div>
        <div className="h-4 w-48 bg-gray-200 rounded mb-6"></div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-2xl p-6 h-32 border border-gray-200"></div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[350px] bg-gray-100 rounded-2xl border border-gray-200"></div>
          <div className="h-[350px] bg-gray-100 rounded-2xl border border-gray-200"></div>
        </div>
      </div>
    );
  }

  // UI de Erro com Botão de Retry
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] p-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-red-800 mb-2">Erro ao carregar dashboard</h3>
          <p className="text-red-600 mb-6 text-sm">{error}</p>
          <Button onClick={fetchStats} variant="destructive" className="gap-2">
            <RefreshCw size={16} /> Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-1 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Dashboard Industrial</h1>
        <p className="text-gray-600 text-sm mt-1">Visão geral da produção e desempenho.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <KPICard 
          title="Total em Carteira" 
          value={totalProducao} 
          icon={Factory} 
          color="bg-blue-100 text-blue-600" 
          subtext="Ordens ativas"
        />
        <KPICard 
          title="Em Produção" 
          value={emProducao} 
          icon={Factory} 
          color="bg-indigo-100 text-indigo-600" 
          subtext="Ordens liberadas"
        />
        <KPICard 
          title="Taxa de Conclusão" 
          value={`${eficiencia}%`} 
          icon={CheckCircle} 
          color="bg-green-100 text-green-600" 
          subtext={`${totalConcluidas} ordens finalizadas`}
        />
        <KPICard 
          title="QA / Inspeções Pendentes" 
          value={qaPendente} 
          icon={ShieldAlert} 
          color="bg-amber-100 text-amber-700" 
          subtext="Ordens aguardando inspeção"
        />
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Trabalhos em andamento</h3>
            <p className="text-sm text-gray-500">Distribuição consolidada (industrialização + beneficiamento)</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Eye size={14} /> Visão rápida de chão de fábrica
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {wipCards.map(card => (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                const tipo = card.key === 'em_beneficiamento' ? 'beneficiamento' : 'industrializacao';
                navigate(`/app/industria/ordens?tipo=${tipo}&status=${encodeURIComponent(card.key)}`);
              }}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm text-left hover:bg-gray-50 transition-colors"
              title="Ver ordens filtradas por status"
            >
              <div className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${card.color}`}>{card.label}</span>
                <Activity className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-3xl font-bold text-gray-800 mt-2">{card.total}</div>
              <div className="text-xs text-gray-500 mt-1">ordens</div>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Atrasos (entrega)</h3>
            <p className="text-sm text-gray-500">Ordens com data prevista menor que hoje (top 10). Clique para abrir a ordem.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-9" onClick={() => navigate('/app/industria/ordens?tipo=industrializacao')}>
              Ver OP/OB
            </Button>
            <Button variant="outline" className="h-9" onClick={() => navigate('/app/industria/relatorios')}>
              Relatórios
            </Button>
          </div>
        </div>
        {(prodLoading || benefLoading) && (
          <div className="text-xs text-gray-500 mb-3">Atualizando lista…</div>
        )}
        {(prodError || benefError) && (
          <div className="text-xs text-amber-700 mb-3">
            {prodError || benefError}
          </div>
        )}
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="min-w-full text-sm table-fixed">
            <TableColGroup columns={atrasosColumns} widths={atrasosWidths} />
            <thead className="bg-gray-50">
              <tr>
                <ResizableSortableTh columnId="tipo" label="Tipo" sort={atrasosSort} onSort={(col) => setAtrasosSort((prev) => toggleSort(prev as any, col))} onResizeStart={startAtrasosResize} className="px-3 py-2" />
                <ResizableSortableTh columnId="ordem" label="Ordem" sort={atrasosSort} onSort={(col) => setAtrasosSort((prev) => toggleSort(prev as any, col))} onResizeStart={startAtrasosResize} className="px-3 py-2" />
                <ResizableSortableTh columnId="cliente" label="Cliente" sort={atrasosSort} onSort={(col) => setAtrasosSort((prev) => toggleSort(prev as any, col))} onResizeStart={startAtrasosResize} className="px-3 py-2" />
                <ResizableSortableTh columnId="prev" label="Prev. entrega" sort={atrasosSort} onSort={(col) => setAtrasosSort((prev) => toggleSort(prev as any, col))} onResizeStart={startAtrasosResize} className="px-3 py-2" />
                <ResizableSortableTh columnId="status" label="Status" sort={atrasosSort} onSort={(col) => setAtrasosSort((prev) => toggleSort(prev as any, col))} onResizeStart={startAtrasosResize} className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ordensAtrasadasSorted.map((o) => (
                <tr
                  key={o.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/app/industria/ordens?tipo=${o.tipo_ordem}&open=${encodeURIComponent(o.id)}`)}
                >
                  <td className="px-3 py-2 text-gray-700">{o.tipo_ordem === 'beneficiamento' ? 'OB' : 'OP'}</td>
                  <td className="px-3 py-2 text-gray-900 font-semibold">{formatOrderNumber(o.numero)}</td>
                  <td className="px-3 py-2 text-gray-700">{o.cliente_nome || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{o.data_prevista_entrega ? new Date(`${o.data_prevista_entrega}T00:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{o.status.replace(/_/g, ' ')}</td>
                </tr>
              ))}
              {ordensAtrasadasSorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500 text-sm">
                    Nenhum atraso detectado (ou não há datas previstas).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={statusChartOption} style={{ height: '100%', width: '100%' }} />
        </GlassCard>
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={barChartOption} style={{ height: '100%', width: '100%' }} />
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Beneficiamento - Trabalhos em andamento</h3>
            <p className="text-sm text-gray-500">
              Itens pendentes por cliente com saldo e documentos de entrada.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">
              {benefLoading ? 'Atualizando...' : benefError ? benefError : `${benefEmAndamento.length} ordens`}
            </div>
            <Button
              variant="outline"
              className="h-9"
              onClick={() => navigate('/app/industria/status-beneficiamentos')}
              title="Abrir a visão completa (com filtros e exportação)"
            >
              Ver tabela completa
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
            <p className="text-xs text-cyan-700 font-semibold">Saldo a entregar (un)</p>
            <p className="text-2xl font-bold text-cyan-800">
              {benefEmAndamento.reduce((acc, o) => acc + Math.max((o.quantidade_planejada ?? 0) - (o.total_entregue ?? 0), 0), 0)}
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs text-amber-700 font-semibold">NF registradas</p>
            <p className="text-lg font-bold text-amber-800">Usando doc. ref. das ordens</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <p className="text-xs text-emerald-700 font-semibold">Pedidos vinculados</p>
            <p className="text-lg font-bold text-emerald-800">Monitoramento consolidado</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="min-w-full text-sm table-fixed">
              <TableColGroup columns={benefColumns} widths={benefWidths} />
              <thead className="bg-gray-50">
                <tr>
                  <ResizableSortableTh columnId="itens" label="Itens em produção" sort={benefSort} onSort={(col) => setBenefSort((prev) => toggleSort(prev as any, col))} onResizeStart={startBenefResize} className="px-3 py-2" />
                  <ResizableSortableTh columnId="caixas" label="Qtde. Caixas" sort={benefSort} onSort={(col) => setBenefSort((prev) => toggleSort(prev as any, col))} onResizeStart={startBenefResize} className="px-3 py-2" />
                  <ResizableSortableTh columnId="op" label="OP" sort={benefSort} onSort={(col) => setBenefSort((prev) => toggleSort(prev as any, col))} onResizeStart={startBenefResize} className="px-3 py-2" />
                  <ResizableSortableTh columnId="cliente" label="Cliente" sort={benefSort} onSort={(col) => setBenefSort((prev) => toggleSort(prev as any, col))} onResizeStart={startBenefResize} className="px-3 py-2" />
                  <ResizableSortableTh columnId="nfCliente" label="Qtde. NF Cliente" sort={benefSort} onSort={(col) => setBenefSort((prev) => toggleSort(prev as any, col))} onResizeStart={startBenefResize} className="px-3 py-2" />
                  <ResizableSortableTh columnId="nf" label="NF" sort={benefSort} onSort={(col) => setBenefSort((prev) => toggleSort(prev as any, col))} onResizeStart={startBenefResize} className="px-3 py-2" />
                  <ResizableSortableTh columnId="pedido" label="Pedido" sort={benefSort} onSort={(col) => setBenefSort((prev) => toggleSort(prev as any, col))} onResizeStart={startBenefResize} className="px-3 py-2" />
                  <ResizableSortableTh columnId="entrada" label="Data de entrada" sort={benefSort} onSort={(col) => setBenefSort((prev) => toggleSort(prev as any, col))} onResizeStart={startBenefResize} className="px-3 py-2" />
                  <ResizableSortableTh columnId="saldo" label="Saldo (A entregar)" sort={benefSort} onSort={(col) => setBenefSort((prev) => toggleSort(prev as any, col))} onResizeStart={startBenefResize} className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {benefTopSorted.map((o) => {
                  const saldo = Math.max((o.quantidade_planejada ?? 0) - (o.total_entregue ?? 0), 0);
                  const qtdeCaixas = o.qtde_caixas ?? '—';
                  const nfNumero = o.numero_nf || o.documento_ref || '—';
                  const pedidoNumero = o.pedido_numero || '—';
                  const dataEntrada = o.created_at || o.data_prevista_inicio || '';
                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/app/industria/ordens?tipo=beneficiamento&open=${encodeURIComponent(o.id)}`)}
                      title="Abrir ordem"
                    >
                      <td className="px-3 py-2 text-gray-800">{o.quantidade_planejada ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-800">{qtdeCaixas}</td>
                      <td className="px-3 py-2 text-gray-800 font-semibold">{formatOrderNumber(o.numero)}</td>
                      <td className="px-3 py-2 text-gray-700">{o.cliente_nome || '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{o.total_entregue ?? 0}</td>
                      <td className="px-3 py-2 text-gray-700">{nfNumero}</td>
                      <td className="px-3 py-2 text-gray-700">{pedidoNumero}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {dataEntrada ? new Date(dataEntrada).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-800 font-semibold">{saldo}</td>
                    </tr>
                  );
                })}
                {benefEmAndamento.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-gray-500 text-sm">
                      Nenhuma ordem de beneficiamento em andamento.
                    </td>
                  </tr>
                )}
                {benefEmAndamento.length > benefTop.length && (
                  <tr>
                    <td colSpan={9} className="px-3 py-3 text-center text-gray-500 text-xs bg-gray-50">
                      Mostrando {benefTop.length} de {benefEmAndamento.length} ordens. Use “Ver tabela completa” para filtros e exportação.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-gray-100 rounded-xl p-3 min-h-[320px]">
              <ReactECharts option={benefStatusChartOption} style={{ height: 300, width: '100%' }} />
            </div>
            <div className="border border-gray-100 rounded-xl p-3 min-h-[320px]">
              <ReactECharts option={benefPipelineChartOption} style={{ height: 300, width: '100%' }} />
            </div>
            <div className="border border-gray-100 rounded-xl p-3 min-h-[320px] lg:col-span-2">
              <ReactECharts option={benefChartOption} style={{ height: 340, width: '100%' }} />
            </div>
          </div>
        </div>
      </GlassCard>

    </div>
  );
}

const KPICard = ({ title, value, icon: Icon, color, subtext }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start justify-between"
  >
    <div>
      <p className="text-gray-500 text-sm font-medium">{title}</p>
      <h3 className="text-3xl font-bold text-gray-800 mt-2">{value}</h3>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
    <div className={`p-3 rounded-xl ${color}`}>
      <Icon size={24} />
    </div>
  </motion.div>
);
