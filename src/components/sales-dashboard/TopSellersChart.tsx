import React from 'react';
import ReactECharts from 'echarts-for-react';
import GlassCard from '../ui/GlassCard';
import { faker } from '@faker-js/faker';

const TopSellersChart: React.FC = () => {
  const sellers = Array.from({ length: 5 }, () => faker.person.firstName());
  const data = sellers.map(() => faker.number.int({ min: 5000, max: 25000 }));

  const option = {
    title: {
        text: 'Top 5 Vendedores',
        left: 'center',
        textStyle: {
            color: '#334155',
            fontWeight: 'bold',
        }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(params[0].value);
        return `${params[0].name}: <strong>${value}</strong>`;
      }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '20%', containLabel: true },
    xAxis: {
      type: 'category',
      data: sellers,
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => `R$ ${value / 1000}k`
      }
    },
    series: [
      {
        name: 'Vendas',
        type: 'bar',
        barWidth: '60%',
        data: data,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#8b5cf6' }, { offset: 1, color: '#3b82f6' }]
          }
        },
        emphasis: {
            itemStyle: {
                color: {
                    type: 'linear',
                    x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: '#a78bfa' }, { offset: 1, color: '#60a5fa' }]
                  }
            }
        }
      },
    ],
  };

  return (
    <GlassCard className="p-4 overflow-hidden h-96">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </GlassCard>
  );
};

export default TopSellersChart;
