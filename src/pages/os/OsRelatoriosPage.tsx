import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart3, CalendarDays, Download, ExternalLink, Loader2, RefreshCw, Search, TrendingUp, Wallet } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Input from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { getOsRelatoriosResumo, listOsRelatorios, type OsRelatoriosListRow, type OsRelatoriosResumo } from '@/services/osRelatorios';
import Pagination from '@/components/ui/Pagination';
import SearchField from '@/components/ui/forms/SearchField';
import { useNavigate } from 'react-router-dom';

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function toDateOrNull(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const STATUS_LABEL: Record<string, string> = {
  orcamento: 'Orçamento',
  aberta: 'Aberta',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export default function OsRelatoriosPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<OsRelatoriosResumo | null>(null);
  const [rows, setRows] = useState<OsRelatoriosListRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[] | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const start = toDateOrNull(startDate);
      const end = toDateOrNull(endDate);
      const offset = (page - 1) * pageSize;

      const [result, list] = await Promise.all([
        getOsRelatoriosResumo({ startDate: start, endDate: end }),
        listOsRelatorios({
          startDate: start,
          endDate: end,
          search: search || null,
          status: statusFilter,
          clienteId,
          limit: pageSize,
          offset,
        }),
      ]);

      setData(result);
      setRows(list.data);
      setCount(list.count);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar relatórios de Serviços.', 'error');
      setData(null);
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [addToast, clienteId, endDate, page, pageSize, search, startDate, statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const porStatus = data?.por_status ?? [];
  const topClientes = data?.top_clientes ?? [];
  const mensal = data?.faturamento_mensal ?? [];

  const statusOption = useMemo(() => {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, bottom: 30, top: 40 },
      xAxis: {
        type: 'category',
        data: porStatus.map((s) => STATUS_LABEL[s.status] || s.status),
        axisLabel: { rotate: 15 },
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Quantidade',
          type: 'bar',
          data: porStatus.map((s) => s.qtd),
          itemStyle: { color: '#3b82f6' },
        },
      ],
    };
  }, [porStatus]);

  const faturamentoOption = useMemo(() => {
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 40, right: 20, bottom: 30, top: 40 },
      xAxis: { type: 'category', data: mensal.map((m) => m.mes) },
      yAxis: { type: 'value' },
      series: [
        { name: 'Faturamento', type: 'line', smooth: true, data: mensal.map((m) => m.faturamento), itemStyle: { color: '#10b981' } },
        { name: 'Custo', type: 'line', smooth: true, data: mensal.map((m) => m.custo_real), itemStyle: { color: '#f97316' } },
        { name: 'Margem', type: 'line', smooth: true, data: mensal.map((m) => m.margem), itemStyle: { color: '#3b82f6' } },
        { name: 'Recebido', type: 'line', smooth: true, data: mensal.map((m) => (m as any).recebido ?? 0), itemStyle: { color: '#8b5cf6' } },
      ],
    };
  }, [mensal]);

  const periodoLabel = data?.periodo ? `${data.periodo.inicio} → ${data.periodo.fim}` : '—';

  const exportCsv = async () => {
    try {
      const start = toDateOrNull(startDate);
      const end = toDateOrNull(endDate);
      const all = await listOsRelatorios({
        startDate: start,
        endDate: end,
        search: search || null,
        status: statusFilter,
        clienteId,
        limit: 5000,
        offset: 0,
      });

      const headers = ['Número', 'Descrição', 'Status', 'Data', 'Cliente', 'Total', 'Custo Real', 'Margem'];
      const lines = all.data.map((r) => {
        const cols = [
          String(r.numero ?? ''),
          `"${String(r.descricao ?? '').replace(/\"/g, '""')}"`,
          STATUS_LABEL[r.status] || r.status,
          r.data_ref,
          `"${String(r.cliente_nome ?? '').replace(/\"/g, '""')}"`,
          String(r.total_geral ?? 0).replace('.', ','),
          String(r.custo_real ?? 0).replace('.', ','),
          String(r.margem ?? 0).replace('.', ','),
        ];
        return cols.join(';');
      });

      const content = [headers.join(';'), ...lines].join('\n');
      const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'relatorio_servicos_os.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao exportar CSV.', 'error');
    }
  };

  const onStatusChartClick = useMemo(() => {
    return {
      click: (params: any) => {
        const idx = Number(params?.dataIndex);
        const s = porStatus[idx]?.status;
        if (!s) return;
        setPage(1);
        setClienteId(null);
        setStatusFilter([s]);
      },
    };
  }, [porStatus]);

  return (
    <div className="p-1 h-full flex flex-col gap-4">
      <PageHeader
        title="Relatórios de Serviços"
        description="Indicadores das Ordens de Serviço (OS) e faturamento por período."
        icon={<BarChart3 className="w-5 h-5" />}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => void exportCsv()} variant="outline" className="gap-2">
              <Download size={16} />
              Exportar
            </Button>
            <Button onClick={fetchData} variant="outline" className="gap-2">
              <RefreshCw size={16} />
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Início"
          name="os_rel_inicio"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full sm:w-[220px]"
          startAdornment={<CalendarDays size={18} />}
        />
        <Input
          label="Fim"
          name="os_rel_fim"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full sm:w-[220px]"
          startAdornment={<CalendarDays size={18} />}
        />
        <div className="text-xs text-gray-500 pb-1">
          Período em análise: <span className="font-medium text-gray-700">{periodoLabel}</span>
        </div>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <SearchField
              placeholder="Buscar por nº, cliente ou descrição..."
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              className="w-full max-w-sm"
            />
            <div className="flex flex-wrap gap-2">
              {(['orcamento', 'aberta', 'concluida', 'cancelada'] as const).map((s) => {
                const active = (statusFilter ?? []).includes(s);
                const anyActive = (statusFilter ?? []).length > 0;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setPage(1);
                      setClienteId(null);
                      setStatusFilter((prev) => {
                        const set = new Set(prev ?? []);
                        if (set.has(s)) set.delete(s);
                        else set.add(s);
                        const next = Array.from(set);
                        return next.length ? next : null;
                      });
                    }}
                    className={[
                      'px-3 py-1 rounded-full text-xs font-semibold border transition',
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : anyActive
                          ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100',
                    ].join(' ')}
                    title="Filtrar por status"
                  >
                    {STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Search size={14} />
            <span>
              {count} resultado(s){clienteId ? ' (cliente filtrado)' : ''}{statusFilter?.length ? ' (status filtrado)' : ''}
            </span>
            {(clienteId || (statusFilter && statusFilter.length) || search.trim()) ? (
              <button
                type="button"
                className="ml-2 text-blue-700 hover:underline font-semibold"
                onClick={() => {
                  setPage(1);
                  setClienteId(null);
                  setStatusFilter(null);
                  setSearch('');
                }}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[420px]">
          <Loader2 className="animate-spin text-blue-600" size={40} />
        </div>
      ) : !data ? (
        <GlassCard className="p-6 text-sm text-gray-600">Não foi possível carregar os dados.</GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">Faturamento (OS concluídas)</div>
                  <div className="text-2xl font-bold text-gray-900">{formatBRL(data.kpis.faturamento)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Margem: {formatBRL(data.kpis.margem)} • Recebido: {formatBRL((data.kpis as any).recebido ?? 0)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                  <TrendingUp size={20} />
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">Custo real (OS concluídas)</div>
                  <div className="text-2xl font-bold text-gray-900">{formatBRL(data.kpis.custo_real)}</div>
                  <div className="text-xs text-gray-500 mt-1">Total de OS: {data.kpis.total_os}</div>
                </div>
                <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                  <Wallet size={20} />
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="text-xs text-gray-500">Concluídas / Abertas / Orçamentos</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-semibold">
                  {data.kpis.total_concluida} Concluídas
                </span>
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-semibold">
                  {data.kpis.total_aberta} Abertas
                </span>
                <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-sm font-semibold">
                  {data.kpis.total_orcamento} Orçamentos
                </span>
                <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-sm font-semibold">
                  {data.kpis.total_cancelada} Canceladas
                </span>
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <GlassCard className="p-4">
              <div className="text-sm font-semibold text-gray-800 mb-2">OS por status (clique para filtrar)</div>
              <ReactECharts option={statusOption} style={{ height: 320, width: '100%' }} onEvents={onStatusChartClick} />
            </GlassCard>

            <GlassCard className="p-4">
              <div className="text-sm font-semibold text-gray-800 mb-2">Faturamento mensal (OS concluídas)</div>
              <ReactECharts option={faturamentoOption} style={{ height: 320, width: '100%' }} />
            </GlassCard>
          </div>

          <GlassCard className="p-4">
            <div className="text-sm font-semibold text-gray-800 mb-3">Top clientes (por faturamento no período)</div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Cliente</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500">OS</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Faturamento</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Custo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {topClientes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                        Nenhum dado no período.
                      </td>
                    </tr>
                  ) : (
                    topClientes.map((c) => (
                      <tr
                        key={c.cliente_id || c.cliente_nome || Math.random()}
                        className="hover:bg-gray-50 cursor-pointer"
                        title="Filtrar lista por cliente"
                        onClick={() => {
                          if (!c.cliente_id) return;
                          setPage(1);
                          setClienteId(c.cliente_id);
                        }}
                      >
                        <td className="px-4 py-2 font-medium text-gray-900">{c.cliente_nome || '—'}</td>
                        <td className="px-4 py-2 text-center">{c.qtd}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatBRL(c.faturamento)}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{formatBRL(c.custo)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-sm font-semibold text-gray-800">Lista detalhada</div>
              <div className="text-xs text-gray-500">Clique em uma linha para abrir a OS.</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">OS</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Cliente</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Data</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Custo</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Margem</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                        Nenhum resultado para os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-gray-50"
                        onClick={() => navigate(`/app/ordens-de-servico?osId=${encodeURIComponent(r.id)}`)}
                        title="Abrir O.S."
                      >
                        <td className="px-4 py-2 font-medium text-gray-900">#{String(r.numero)}</td>
                        <td className="px-4 py-2 text-gray-700">{r.cliente_nome || '—'}</td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                            {STATUS_LABEL[r.status] || r.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{r.data_ref}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatBRL(r.total_geral)}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{formatBRL(r.custo_real)}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{formatBRL(r.margem)}</td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/app/ordens-de-servico?osId=${encodeURIComponent(r.id)}`);
                            }}
                          >
                            <ExternalLink size={14} />
                            Abrir
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {count > pageSize && (
              <div className="mt-3">
                <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
