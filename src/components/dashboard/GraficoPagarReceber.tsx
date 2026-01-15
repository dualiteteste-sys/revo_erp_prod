import React from 'react';
import ReactECharts from 'echarts-for-react';
import GlassCard from '../ui/GlassCard';
import { formatCurrency } from '@/lib/utils';

export type PagarReceberPoint = { mes: string; pagar: number; receber: number };

function formatMesLabel(ym: string) {
  // ym = YYYY-MM
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

const GraficoPagarReceber: React.FC<{ series: PagarReceberPoint[]; loading?: boolean }> = ({ series, loading }) => {
  const x = (series ?? []).map((s) => formatMesLabel(s.mes));
  const pagar = (series ?? []).map((s) => Number(s.pagar ?? 0));
  const receber = (series ?? []).map((s) => Number(s.receber ?? 0));

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151' },
      formatter: (params: any) => {
        const lines = (Array.isArray(params) ? params : [params]).map((p: any) => {
          const value = formatCurrency(Math.round(Number(p?.value || 0) * 100));
          return `${p?.marker} ${p?.seriesName}: <strong>${value}</strong>`;
        });
        const title = params?.[0]?.axisValueLabel ?? '';
        return `${title}<br/>${lines.join('<br/>')}`;
      },
    },
    legend: {
      top: 12,
      left: 16,
      textStyle: { color: '#334155', fontWeight: 600 },
      itemWidth: 12,
      itemHeight: 12,
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '20%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: x,
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed', color: '#e5e7eb' } },
    },
    series: [
      {
        name: 'A Receber (previsto)',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#3b82f6', borderColor: '#fff', borderWidth: 2 },
        lineStyle: {
          width: 3,
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#3b82f6' },
              { offset: 1, color: '#8b5cf6' },
            ],
          },
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.22)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0)' },
            ],
          },
        },
        data: receber,
        animationDuration: 2000,
        animationEasing: 'cubicInOut',
      },
      {
        name: 'A Pagar (previsto)',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#f97316', borderColor: '#fff', borderWidth: 2 },
        lineStyle: {
          width: 3,
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#f97316' },
              { offset: 1, color: '#ef4444' },
            ],
          },
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(249, 115, 22, 0.18)' },
              { offset: 1, color: 'rgba(249, 115, 22, 0)' },
            ],
          },
        },
        data: pagar,
        animationDuration: 2000,
        animationEasing: 'cubicInOut',
      },
    ],
  };

  return (
    <GlassCard className="p-0 overflow-hidden h-96">
      {loading ? (
        <div className="h-full w-full animate-pulse bg-slate-100" />
      ) : (
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
      )}
    </GlassCard>
  );
};

export default GraficoPagarReceber;

