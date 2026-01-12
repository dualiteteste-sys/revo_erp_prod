import React from 'react';
import ReactECharts from 'echarts-for-react';
import GlassCard from '../ui/GlassCard';

type StatusRow = { status: string; count: number };

const palette = ['#3b82f6', '#10b981', '#f97316', '#ef4444', '#8b5cf6', '#06b6d4', '#f59e0b', '#64748b'];

const GraficoVendas: React.FC<{ status: StatusRow[]; loading?: boolean }> = ({ status, loading }) => {
  const rows = (status ?? []).filter(Boolean);
  const top = rows.slice(0, 6);
  const rest = rows.slice(6);
  const restCount = rest.reduce((acc, r) => acc + Number(r.count || 0), 0);

  const pieData = [
    ...top.map((r, idx) => ({
      value: Number(r.count || 0),
      name: r.status,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 1,
          y2: 1,
          colorStops: [
            { offset: 0, color: palette[idx % palette.length] },
            { offset: 1, color: palette[(idx + 2) % palette.length] },
          ],
        },
      },
    })),
    ...(restCount > 0
      ? [
          {
            value: restCount,
            name: 'Outros',
            itemStyle: { color: '#94a3b8' },
          },
        ]
      : []),
  ];

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p?.name}: <strong>${p?.value ?? 0}</strong> (${p?.percent ?? 0}%)`,
    },
    legend: { show: false },
    series: [
      {
        name: 'Pedidos por status',
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
            formatter: (p: any) => `${p?.name}\n${p?.percent ?? 0}%`,
          },
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        labelLine: { show: false },
        data: pieData,
        animationType: 'scale',
        animationEasing: 'elasticOut',
        animationDelay: (idx: number) => Math.random() * 200
      }
    ]
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

export default GraficoVendas;
