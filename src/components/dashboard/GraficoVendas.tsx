import React from 'react';
import ReactECharts from 'echarts-for-react';
import GlassCard from '../ui/GlassCard';

const GraficoVendas: React.FC = () => {
  const option = {
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    legend: { show: false },
    series: [
      {
        name: 'Vendas',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: 'rgba(255, 255, 255, 0.8)',
          borderWidth: 2
        },
        label: { show: false, position: 'center' },
        emphasis: {
          label: {
            show: true,
            fontSize: '16',
            fontWeight: 'bold',
            formatter: '{b}\n{d}%'
          },
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        labelLine: { show: false },
        data: [
          { value: 1048, name: 'Eletrônicos', itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: '#60a5fa' }] } } },
          { value: 735, name: 'Móveis', itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: '#10b981' }, { offset: 1, color: '#34d399' }] } } },
          { value: 580, name: 'Roupas', itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: '#f97316' }, { offset: 1, color: '#fb923c' }] } } },
          { value: 484, name: 'Alimentos', itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: '#ef4444' }, { offset: 1, color: '#f87171' }] } } },
          { value: 300, name: 'Outros', itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: '#8b5cf6' }, { offset: 1, color: '#a78bfa' }] } } }
        ],
        animationType: 'scale',
        animationEasing: 'elasticOut',
        animationDelay: (idx: number) => Math.random() * 200
      }
    ]
  };

  return (
    <GlassCard className="p-0 overflow-hidden h-96">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </GlassCard>
  );
};

export default GraficoVendas;
