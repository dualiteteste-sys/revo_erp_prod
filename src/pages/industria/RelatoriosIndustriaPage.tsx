import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart3, CalendarDays, Loader2, PackageSearch, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import Input from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import {
  getIndustriaWipKpis,
  getQualidadeKpis,
  listPcpCargaCapacidade,
  listPcpKpis,
  type IndustriaWipKpis,
  type PcpCargaCapacidade,
  type PcpKpis,
  type QualidadeKpis,
} from '@/services/industriaProducao';
import { getRelatorioBaixoEstoque, type RelatorioBaixoEstoqueItem } from '@/services/suprimentos';

function formatNumber(value: number, digits = 0) {
  const v = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

function formatPercent(value: number, digits = 1) {
  const v = Number.isFinite(value) ? value : 0;
  return `${formatNumber(v, digits)}%`;
}

function toDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toDateOrNull(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : value;
}

type DashboardData = {
  carga: PcpCargaCapacidade[];
  kpis: PcpKpis;
  wip: IndustriaWipKpis;
  qualidade: QualidadeKpis;
  baixoEstoque: RelatorioBaixoEstoqueItem[];
};

export default function RelatoriosIndustriaPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sortBaixoEstoque, setSortBaixoEstoque] = useState<SortState<'produto' | 'sku' | 'saldo' | 'min' | 'max' | 'sug' | 'fornecedor'>>({
    column: 'sug',
    direction: 'desc',
  });

  const baixoEstoqueColumns: TableColumnWidthDef[] = [
    { id: 'produto', defaultWidth: 360, minWidth: 220 },
    { id: 'sku', defaultWidth: 160, minWidth: 120 },
    { id: 'saldo', defaultWidth: 140, minWidth: 120 },
    { id: 'min', defaultWidth: 120, minWidth: 110 },
    { id: 'max', defaultWidth: 120, minWidth: 110 },
    { id: 'sug', defaultWidth: 150, minWidth: 130 },
    { id: 'fornecedor', defaultWidth: 240, minWidth: 180 },
  ];
  const { widths: baixoEstoqueWidths, startResize: startBaixoEstoqueResize } = useTableColumnWidths({
    tableId: 'industria:relatorios:baixo-estoque',
    columns: baixoEstoqueColumns,
  });

  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return toDateInputValue(d);
  });
  const [endDate, setEndDate] = useState<string>(() => toDateInputValue(new Date()));
  const [periodoKpis, setPeriodoKpis] = useState<number>(30);
  const [searchBaixoEstoque, setSearchBaixoEstoque] = useState<string>('');
  const [data, setData] = useState<DashboardData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [carga, kpis, wip, qualidade, baixoEstoque] = await Promise.all([
        listPcpCargaCapacidade(toDateOrNull(startDate) || undefined, toDateOrNull(endDate) || undefined),
        listPcpKpis(periodoKpis),
        getIndustriaWipKpis(periodoKpis),
        getQualidadeKpis(periodoKpis),
        getRelatorioBaixoEstoque(searchBaixoEstoque),
      ]);
      setData({ carga, kpis, wip, qualidade, baixoEstoque });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar relatórios de Indústria.', 'error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [addToast, endDate, periodoKpis, searchBaixoEstoque, startDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const carga = data?.carga ?? [];
  const kpis = data?.kpis ?? null;
  const wip = data?.wip ?? null;
  const qualidade = data?.qualidade ?? null;
  const baixoEstoque = data?.baixoEstoque ?? [];

  const totals = useMemo(() => {
    const totalCarga = carga.reduce((acc, item) => acc + (item.carga_total_horas || 0), 0);
    const totalCap = carga.reduce((acc, item) => acc + (item.capacidade_horas || 0), 0);
    const overload = Math.max(0, totalCarga - totalCap);
    const overloadPct = totalCap > 0 ? (overload / totalCap) * 100 : 0;
    return { totalCarga, totalCap, overload, overloadPct };
  }, [carga]);

  const byDia = useMemo(() => {
    const map = new Map<string, { dia: string; carga: number; cap: number }>();
    for (const item of carga) {
      const key = item.dia;
      const prev = map.get(key) || { dia: key, carga: 0, cap: 0 };
      prev.carga += item.carga_total_horas || 0;
      prev.cap += item.capacidade_horas || 0;
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => a.dia.localeCompare(b.dia));
  }, [carga]);

  const byCt = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; carga: number; cap: number }>();
    for (const item of carga) {
      const key = item.centro_trabalho_id;
      const prev = map.get(key) || { id: key, nome: item.centro_trabalho_nome || '—', carga: 0, cap: 0 };
      prev.carga += item.carga_total_horas || 0;
      prev.cap += item.capacidade_horas || 0;
      map.set(key, prev);
    }
    return Array.from(map.values())
      .map((ct) => ({
        ...ct,
        overload: Math.max(0, ct.carga - ct.cap),
      }))
      .sort((a, b) => b.overload - a.overload);
  }, [carga]);

  const dailyOption = useMemo(() => {
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 40, right: 20, bottom: 30, top: 40 },
      xAxis: { type: 'category', data: byDia.map((d) => d.dia) },
      yAxis: { type: 'value', name: 'Horas' },
      series: [
        {
          name: 'Carga (h)',
          type: 'line',
          smooth: true,
          data: byDia.map((d) => Number(d.carga.toFixed(2))),
          lineStyle: { color: '#3b82f6', width: 3 },
          itemStyle: { color: '#3b82f6' },
          areaStyle: { color: 'rgba(59,130,246,0.15)' },
        },
        {
          name: 'Capacidade (h)',
          type: 'line',
          smooth: true,
          data: byDia.map((d) => Number(d.cap.toFixed(2))),
          lineStyle: { color: '#10b981', width: 3 },
          itemStyle: { color: '#10b981' },
          areaStyle: { color: 'rgba(16,185,129,0.10)' },
        },
      ],
    };
  }, [byDia]);

  const ctOption = useMemo(() => {
    const max = Math.min(byCt.length, 12);
    const top = byCt.slice(0, max).reverse();
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0 },
      grid: { left: 120, right: 20, bottom: 20, top: 40 },
      xAxis: { type: 'value', name: 'Horas' },
      yAxis: { type: 'category', data: top.map((ct) => ct.nome) },
      series: [
        {
          name: 'Capacidade (h)',
          type: 'bar',
          data: top.map((ct) => Number(ct.cap.toFixed(2))),
          itemStyle: { color: '#10b981' },
        },
        {
          name: 'Carga (h)',
          type: 'bar',
          data: top.map((ct) => Number(ct.carga.toFixed(2))),
          itemStyle: { color: '#3b82f6' },
        },
      ],
    };
  }, [byCt]);

  const baixoEstoqueTop = useMemo(() => {
    return [...baixoEstoque]
      .filter((i) => (i.sugestao_compra || 0) > 0)
      .sort((a, b) => (b.sugestao_compra || 0) - (a.sugestao_compra || 0))
      .slice(0, 20);
  }, [baixoEstoque]);

  const baixoEstoqueSorted = useMemo(() => {
    return sortRows(
      baixoEstoqueTop,
      sortBaixoEstoque as any,
      [
        { id: 'produto', type: 'string', getValue: (i: RelatorioBaixoEstoqueItem) => i.nome ?? '' },
        { id: 'sku', type: 'string', getValue: (i: RelatorioBaixoEstoqueItem) => i.sku ?? '' },
        { id: 'saldo', type: 'number', getValue: (i: RelatorioBaixoEstoqueItem) => i.saldo ?? 0 },
        { id: 'min', type: 'number', getValue: (i: RelatorioBaixoEstoqueItem) => i.estoque_min ?? 0 },
        { id: 'max', type: 'number', getValue: (i: RelatorioBaixoEstoqueItem) => i.estoque_max ?? 0 },
        { id: 'sug', type: 'number', getValue: (i: RelatorioBaixoEstoqueItem) => i.sugestao_compra ?? 0 },
        { id: 'fornecedor', type: 'string', getValue: (i: RelatorioBaixoEstoqueItem) => i.fornecedor_nome ?? '' },
      ] as const
    );
  }, [baixoEstoqueTop, sortBaixoEstoque]);

  return (
    <div className="p-2 space-y-6">
      <PageHeader
        title="Relatórios de Indústria"
        description="Visão rápida para PCP, execução e rupturas de estoque."
        icon={<BarChart3 className="w-5 h-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void fetchData()}>
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
            <Button variant="secondary" onClick={() => navigate('/app/industria/pcp')}>
              <CalendarDays className="w-4 h-4 mr-2" /> Abrir PCP
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <GlassCard className="p-4 lg:col-span-12">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <Input name="startDate" label="Data inicial" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <Input name="endDate" label="Data final" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Input
                name="periodoKpis"
                label="KPIs (dias)"
                type="number"
                value={String(periodoKpis)}
                onChange={(e) => setPeriodoKpis(Math.max(7, Math.min(365, Number(e.target.value || 30))))}
              />
            </div>
            <div className="md:col-span-4">
              <Input
                name="searchBaixoEstoque"
                label="Baixo estoque (filtro)"
                placeholder="Produto / SKU / código..."
                value={searchBaixoEstoque}
                onChange={(e) => setSearchBaixoEstoque(e.target.value)}
              />
            </div>
          </div>
        </GlassCard>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <GlassCard className="p-5 md:col-span-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Carga total (h)</p>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{formatNumber(totals.totalCarga, 1)}</div>
              <p className="text-xs text-gray-500 mt-1">Somatório no período</p>
            </GlassCard>
            <GlassCard className="p-5 md:col-span-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Capacidade (h)</p>
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{formatNumber(totals.totalCap, 1)}</div>
              <p className="text-xs text-gray-500 mt-1">Calendário/CTs</p>
            </GlassCard>
            <GlassCard className="p-5 md:col-span-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Sobrecarga (h)</p>
                <TrendingDown className="w-5 h-5 text-rose-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{formatNumber(totals.overload, 1)}</div>
              <p className="text-xs text-gray-500 mt-1">{formatPercent(totals.overloadPct, 1)} da capacidade</p>
            </GlassCard>
            <GlassCard className="p-5 md:col-span-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">OTIF (últimos {kpis?.periodo_dias ?? periodoKpis} dias)</p>
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{formatPercent(kpis?.otif_percent ?? 0, 1)}</div>
              <p className="text-xs text-gray-500 mt-1">
                {formatNumber(kpis?.ordens_concluidas ?? 0)} OPs concluídas · Refugo {formatPercent(kpis?.percentual_refugo ?? 0, 1)}
              </p>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <GlassCard className="p-5 md:col-span-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">WIP & Fila (últimos {wip?.periodo_dias ?? periodoKpis} dias)</p>
                <PackageSearch className="w-5 h-5 text-sky-600" />
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Ordens WIP</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(wip?.ordens_wip ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Na fila</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(wip?.operacoes_na_fila ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Em execução</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(wip?.operacoes_em_execucao ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Pausadas</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(wip?.operacoes_pausadas ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Concluídas</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(wip?.operacoes_concluidas_periodo ?? 0)}</p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5 md:col-span-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Qualidade (lotes)</p>
                <PackageSearch className="w-5 h-5 text-rose-600" />
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(qualidade?.lotes_total ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Bloqueados</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(qualidade?.lotes_bloqueados ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Em análise</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(qualidade?.lotes_em_analise ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Saldo bloqueado (un)</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(qualidade?.saldo_bloqueado ?? 0, 2)}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Inspeções no período: {formatNumber(qualidade?.inspecoes_periodo ?? 0)} ·{' '}
                <button
                  type="button"
                  className="text-blue-700 hover:underline"
                  onClick={() => navigate('/app/industria/qualidade/lotes')}
                >
                  Abrir Lotes & Bloqueio
                </button>
              </p>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <GlassCard className="p-4 lg:col-span-7">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-900">Carga x Capacidade (diário)</h2>
                <span className="text-xs text-gray-500">{byDia.length} dias</span>
              </div>
              <div className="h-72">
                <ReactECharts option={dailyOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </GlassCard>

            <GlassCard className="p-4 lg:col-span-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-900">Centros com maior sobrecarga</h2>
                <span className="text-xs text-gray-500">Top {Math.min(byCt.length, 12)}</span>
              </div>
              <div className="h-72">
                <ReactECharts option={ctOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <GlassCard className="p-4 lg:col-span-12">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <PackageSearch className="w-5 h-5 text-amber-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Rupturas / Baixo estoque</h2>
                    <p className="text-xs text-gray-500">Sugestões com base no estoque mínimo/máximo.</p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => navigate('/app/suprimentos/relatorios')}>
                  Ver relatório completo
                </Button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="min-w-full text-sm table-fixed">
                  <TableColGroup columns={baixoEstoqueColumns} widths={baixoEstoqueWidths} />
                  <thead className="bg-gray-50">
                    <tr>
                      <ResizableSortableTh
                        columnId="produto"
                        label="Produto"
                        sort={sortBaixoEstoque}
                        onSort={(col) => setSortBaixoEstoque((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startBaixoEstoqueResize}
                        className="px-4 py-3 normal-case tracking-normal"
                      />
                      <ResizableSortableTh
                        columnId="sku"
                        label="SKU"
                        sort={sortBaixoEstoque}
                        onSort={(col) => setSortBaixoEstoque((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startBaixoEstoqueResize}
                        className="px-4 py-3 normal-case tracking-normal"
                      />
                      <ResizableSortableTh
                        columnId="saldo"
                        label="Saldo"
                        sort={sortBaixoEstoque}
                        onSort={(col) => setSortBaixoEstoque((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startBaixoEstoqueResize}
                        align="right"
                        className="px-4 py-3 normal-case tracking-normal"
                      />
                      <ResizableSortableTh
                        columnId="min"
                        label="Mín."
                        sort={sortBaixoEstoque}
                        onSort={(col) => setSortBaixoEstoque((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startBaixoEstoqueResize}
                        align="right"
                        className="px-4 py-3 normal-case tracking-normal"
                      />
                      <ResizableSortableTh
                        columnId="max"
                        label="Máx."
                        sort={sortBaixoEstoque}
                        onSort={(col) => setSortBaixoEstoque((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startBaixoEstoqueResize}
                        align="right"
                        className="px-4 py-3 normal-case tracking-normal"
                      />
                      <ResizableSortableTh
                        columnId="sug"
                        label="Sug. compra"
                        sort={sortBaixoEstoque}
                        onSort={(col) => setSortBaixoEstoque((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startBaixoEstoqueResize}
                        align="right"
                        className="px-4 py-3 normal-case tracking-normal"
                      />
                      <ResizableSortableTh
                        columnId="fornecedor"
                        label="Fornecedor"
                        sort={sortBaixoEstoque}
                        onSort={(col) => setSortBaixoEstoque((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startBaixoEstoqueResize}
                        className="px-4 py-3 normal-case tracking-normal"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {baixoEstoqueTop.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                          Nenhum item em baixo estoque no filtro atual.
                        </td>
                      </tr>
                    ) : (
                      baixoEstoqueSorted.map((item) => (
                        <tr key={item.produto_id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900">{item.nome}</td>
                          <td className="px-4 py-2 text-gray-500">{item.sku || '—'}</td>
                          <td className="px-4 py-2 text-right">{formatNumber(item.saldo, 2)}</td>
                          <td className="px-4 py-2 text-right">{formatNumber(item.estoque_min || 0, 2)}</td>
                          <td className="px-4 py-2 text-right">{formatNumber(item.estoque_max || 0, 2)}</td>
                          <td className="px-4 py-2 text-right font-semibold text-amber-700">
                            {formatNumber(item.sugestao_compra || 0, 2)}
                          </td>
                          <td className="px-4 py-2 text-gray-600">{item.fornecedor_nome || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
