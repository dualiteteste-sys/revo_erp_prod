import React, { useEffect, useState } from 'react';
import { getDashboardStats, DashboardStats } from '@/services/industria';
import { Loader2, AlertCircle, CheckCircle, Clock, Factory } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';

export default function IndustriaDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await getDashboardStats();
        setStats(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-12 h-12" />
      </div>
    );
  }

  const statusChartOption = {
    title: { text: 'Ordens por Status', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item' },
    legend: { bottom: '0%' },
    series: [
      {
        name: 'Status',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
        data: stats.by_status.map(s => ({
          value: s.total,
          name: s.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }))
      }
    ]
  };

  const typeChartOption = {
    title: { text: 'Tipo de Produção', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item' },
    series: [
      {
        name: 'Tipo',
        type: 'pie',
        radius: '60%',
        data: stats.by_type.map(t => ({
          value: t.total,
          name: t.tipo_ordem === 'industrializacao' ? 'Industrialização' : 'Beneficiamento'
        }))
      }
    ]
  };

  return (
    <div className="p-1 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Dashboard Industrial</h1>
        <p className="text-gray-600 text-sm mt-1">Visão geral da produção e desempenho.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Total Planejado" 
          value={stats.total_planejado} 
          icon={Factory} 
          color="bg-blue-100 text-blue-600" 
          subtext="Unidades em carteira"
        />
        <KPICard 
          title="Total Entregue" 
          value={stats.total_entregue} 
          icon={CheckCircle} 
          color="bg-green-100 text-green-600" 
          subtext="Produção realizada"
        />
        <KPICard 
          title="Ordens Atrasadas" 
          value={stats.total_atrasadas} 
          icon={AlertCircle} 
          color="bg-red-100 text-red-600" 
          subtext="Prazo de entrega vencido"
        />
        <KPICard 
          title="Eficiência Global" 
          value={`${stats.total_planejado > 0 ? Math.round((stats.total_entregue / stats.total_planejado) * 100) : 0}%`} 
          icon={Clock} 
          color="bg-purple-100 text-purple-600" 
          subtext="Entregue vs Planejado"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={statusChartOption} style={{ height: '100%', width: '100%' }} />
        </GlassCard>
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={typeChartOption} style={{ height: '100%', width: '100%' }} />
        </GlassCard>
      </div>
    </div>
  );
}

const KPICard = ({ title, value, icon: Icon, color, subtext }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start justify-between"
  >
    <div>
      <p className="text-gray-500 text-sm font-medium">{title}</p>
      <h3 className="text-3xl font-bold text-gray-800 mt-2">{value}</h3>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
    <div className={`p-3 rounded-xl ${color}`}>
      <Icon size={24} />
    </div>
  </motion.div>
);
