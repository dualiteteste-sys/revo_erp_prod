import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, FileText, Loader2, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import ReactECharts from 'echarts-for-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Input from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { getFinanceiroRelatoriosResumo, type FinanceiroRelatoriosResumo } from '@/services/financeiroRelatorios';
import { useNavigate } from 'react-router-dom';

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function toDateOrNull(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function RelatoriosFinanceiroPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [data, setData] = useState<FinanceiroRelatoriosResumo | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFinanceiroRelatoriosResumo({
        startDate: toDateOrNull(startDate),
        endDate: toDateOrNull(endDate),
      });
      setData(result);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar relatórios do Financeiro.', 'error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [addToast, endDate, startDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const series = data?.series ?? [];

  const cashflowOption = useMemo(() => {
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 40, right: 20, bottom: 30, top: 40 },
      xAxis: { type: 'category', data: series.map((s) => s.mes) },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Entradas',
          type: 'bar',
          data: series.map((s) => s.entradas),
          itemStyle: { color: '#10b981' },
        },
        {
          name: 'Saídas',
          type: 'bar',
          data: series.map((s) => s.saidas),
          itemStyle: { color: '#ef4444' },
        },
      ],
    };
  }, [series]);

  const pagosOption = useMemo(() => {
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 40, right: 20, bottom: 30, top: 40 },
      xAxis: { type: 'category', data: series.map((s) => s.mes) },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Recebimentos (Pagos)',
          type: 'line',
          smooth: true,
          data: series.map((s) => s.receber_pago),
          lineStyle: { color: '#3b82f6' },
          itemStyle: { color: '#3b82f6' },
        },
        {
          name: 'Pagamentos (Pagos)',
          type: 'line',
          smooth: true,
          data: series.map((s) => s.pagar_pago),
          lineStyle: { color: '#f97316' },
          itemStyle: { color: '#f97316' },
        },
      ],
    };
  }, [series]);

  const periodoLabel = data?.periodo
    ? `${data.periodo.inicio} → ${data.periodo.fim}`
    : '—';

  return (
    <div className="p-1 h-full flex flex-col gap-4">
      <PageHeader
        title="Relatórios do Financeiro"
        description="Visão consolidada de caixa, contas a receber e a pagar."
        icon={<BarChart3 className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/app/financeiro/tesouraria')} variant="outline" className="gap-2">
              <Wallet size={16} />
              Tesouraria
            </Button>
            <Button onClick={() => navigate('/app/financeiro/contas-a-receber')} variant="outline" className="gap-2">
              <TrendingUp size={16} />
              Contas a Receber
            </Button>
            <Button onClick={() => navigate('/app/financeiro/contas-a-pagar')} variant="outline" className="gap-2">
              <TrendingDown size={16} />
              Contas a Pagar
            </Button>
            <Button onClick={() => navigate('/app/servicos/relatorios')} variant="outline" className="gap-2">
              <FileText size={16} />
              Relatórios de Serviços
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
          name="fin_rel_inicio"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full sm:w-[220px]"
          startAdornment={<CalendarDays size={18} />}
        />
        <Input
          label="Fim"
          name="fin_rel_fim"
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
            <GlassCard className="p-5 cursor-pointer" onClick={() => navigate('/app/financeiro/tesouraria')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">Saldo total (Caixa)</div>
                  <div className="text-2xl font-bold text-gray-900">{formatBRL(data.caixa.saldo_total)}</div>
                  <div className="text-xs text-gray-500 mt-1">{data.caixa.contas_ativas} conta(s) ativa(s)</div>
                </div>
                <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                  <Wallet size={20} />
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5 cursor-pointer" onClick={() => navigate('/app/financeiro/contas-a-receber')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">A Receber (pendente)</div>
                  <div className="text-2xl font-bold text-gray-900">{formatBRL(data.receber.total_pendente)}</div>
                  <div className="text-xs text-rose-600 mt-1">
                    Vencido: {formatBRL(data.receber.total_vencido)} • {data.receber.qtd_vencido} título(s)
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                  <TrendingUp size={20} />
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5 cursor-pointer" onClick={() => navigate('/app/financeiro/contas-a-pagar')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">A Pagar (aberta)</div>
                  <div className="text-2xl font-bold text-gray-900">{formatBRL(data.pagar.total_aberta + data.pagar.total_parcial)}</div>
                  <div className="text-xs text-rose-600 mt-1">
                    Vencida: {formatBRL(data.pagar.total_vencida)} • {data.pagar.qtd_aberta + data.pagar.qtd_parcial} título(s)
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-orange-50 text-orange-700">
                  <TrendingDown size={20} />
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <GlassCard className="p-4">
              <div className="text-sm font-semibold text-gray-800 mb-2">Fluxo de caixa (Entradas x Saídas)</div>
              <ReactECharts option={cashflowOption} style={{ height: 320, width: '100%' }} />
            </GlassCard>

            <GlassCard className="p-4">
              <div className="text-sm font-semibold text-gray-800 mb-2">Pagos no período (Receber x Pagar)</div>
              <ReactECharts option={pagosOption} style={{ height: 320, width: '100%' }} />
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
