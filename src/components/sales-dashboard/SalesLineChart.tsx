import React from 'react';
import ReactECharts from 'echarts-for-react';
import GlassCard from '../ui/GlassCard';

export default function SalesLineChart(props: { labels: string[]; values: number[]; title?: string }) {
  const labels = props.labels;
  const data = props.values;
  const title = props.title ?? 'Faturamento por Período';

  const option = {
    title: {
        text: title,
        left: 'center',
        textStyle: {
            color: '#334155',
            fontWeight: 'bold',
        }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151' },
      formatter: (params: any) => {
        const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(params[0].value);
        return `${params[0].name}: <strong>${value}</strong>`;
      }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '20%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed', color: '#e5e7eb' } },
      axisLabel: {
        formatter: (value: number) => `R$ ${value / 1000}k`
      }
    },
    series: [
      {
        name: 'Faturamento',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: {
          color: '#3b82f6',
          borderColor: '#fff',
          borderWidth: 2,
        },
        lineStyle: {
          width: 3,
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: '#8b5cf6' }]
          }
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(59, 130, 246, 0.3)' }, { offset: 1, color: 'rgba(59, 130, 246, 0)' }]
          }
        },
        data: data,
        animationDuration: 2000,
        animationEasing: 'cubicInOut',
      },
    ],
  };

  return (
    <GlassCard className="p-4 overflow-hidden h-96">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </GlassCard>
  );
}
