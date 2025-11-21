import React from 'react';
import ReactECharts from 'echarts-for-react';
import GlassCard from '../ui/GlassCard';

const GraficoFaturamento: React.FC = () => {
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151' },
      formatter: '{b}: <strong>R$ {c}</strong>'
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed', color: '#e5e7eb' } },
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
        data: [1200, 1800, 1500, 2500, 2100, 3000, 2800],
        animationDuration: 2000,
        animationEasing: 'cubicInOut',
      },
    ],
  };

  return (
    <GlassCard className="p-0 overflow-hidden h-96">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </GlassCard>
  );
};

export default GraficoFaturamento;
