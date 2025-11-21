import React from 'react';
import ReactECharts from 'echarts-for-react';
import GlassCard from '../ui/GlassCard';
import { faker } from '@faker-js/faker';

const TopProductsChart: React.FC = () => {
    const data = Array.from({ length: 5 }, () => ({
        value: faker.number.int({ min: 100, max: 1000 }),
        name: faker.commerce.productName(),
    }));

  const option = {
    title: {
        text: 'Top 5 Produtos',
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
        data: data.map(d => d.name)
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
        data: data,
        animationType: 'scale',
        animationEasing: 'elasticOut',
        animationDelay: (idx: number) => Math.random() * 200
      }
    ]
  };

  return (
    <GlassCard className="p-4 overflow-hidden h-96">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </GlassCard>
  );
};

export default TopProductsChart;
