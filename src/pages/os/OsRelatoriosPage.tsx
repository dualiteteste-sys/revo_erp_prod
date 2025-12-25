import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart3, CalendarDays, Loader2, RefreshCw, TrendingUp, Wallet } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Input from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { getOsRelatoriosResumo, type OsRelatoriosResumo } from '@/services/osRelatorios';

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
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<OsRelatoriosResumo | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getOsRelatoriosResumo({
        startDate: toDateOrNull(startDate),
        endDate: toDateOrNull(endDate),
      });
      setData(result);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar relatórios de Serviços.', 'error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [addToast, endDate, startDate]);

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
      ],
    };
  }, [mensal]);

  const periodoLabel = data?.periodo ? `${data.periodo.inicio} → ${data.periodo.fim}` : '—';

  return (
    <div className="p-1 h-full flex flex-col gap-4">
      <PageHeader
        title="Relatórios de Serviços"
        description="Indicadores das Ordens de Serviço (OS) e faturamento por período."
        icon={<BarChart3 className="w-5 h-5" />}
        actions={
          <Button onClick={fetchData} variant="outline" className="gap-2">
            <RefreshCw size={16} />
            Atualizar
          </Button>
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
                  <div className="text-xs text-gray-500 mt-1">Margem: {formatBRL(data.kpis.margem)}</div>
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
              <div className="text-sm font-semibold text-gray-800 mb-2">OS por status</div>
              <ReactECharts option={statusOption} style={{ height: 320, width: '100%' }} />
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
                      <tr key={c.cliente_id || c.cliente_nome || Math.random()} className="hover:bg-gray-50">
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
        </>
      )}
    </div>
  );
}

