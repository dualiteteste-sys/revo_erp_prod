import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import GlassCard from '../ui/GlassCard';

const TopProductsChart = React.memo(function TopProductsChart(props: {
  items: Array<{ name: string; value: number }>;
  title?: string;
}) {
  const { items, title: titleText = 'Top 5 Produtos' } = props;

  const option = useMemo(() => ({
    title: {
      text: titleText,
      left: 'center',
      textStyle: {
        color: '#334155',
        fontWeight: 'bold',
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle',
      data: items.map(d => d.name)
    },
    series: [
      {
        name: 'Vendas',
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['65%', '55%'],
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
          }
        },
        labelLine: { show: false },
        data: items,
        animationType: 'scale',
        animationEasing: 'elasticOut',
        animationDelay: (idx: number) => idx * 50
      }
    ]
  }), [items, titleText]);

  return (
    <GlassCard className="p-4 overflow-hidden h-96">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </GlassCard>
  );
});

export default TopProductsChart;
