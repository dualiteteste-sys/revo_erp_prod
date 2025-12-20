import React, { useEffect, useState, useCallback } from 'react';
import { getDashboardStats, DashboardStats } from '@/services/industria';
import { AlertCircle, CheckCircle, Factory, RefreshCw } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { logger } from '@/lib/logger';

export default function IndustriaDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardStats();
      // Validação básica para garantir que não recebemos null/undefined
      if (!data) throw new Error("Dados não recebidos do servidor.");
      setStats(data);
    } catch (err: any) {
      logger.error('[Indústria][Dashboard] Erro ao carregar dashboard', err);
      // Tratamento de erro amigável
      setError(err.message || "Não foi possível carregar os dados do dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // UI de Carregamento (Skeleton)
  if (loading) {
    return (
      <div className="p-1 space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded mb-2"></div>
        <div className="h-4 w-48 bg-gray-200 rounded mb-6"></div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-2xl p-6 h-32 border border-gray-200"></div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[350px] bg-gray-100 rounded-2xl border border-gray-200"></div>
          <div className="h-[350px] bg-gray-100 rounded-2xl border border-gray-200"></div>
        </div>
      </div>
    );
  }

  // UI de Erro com Botão de Retry
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] p-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-red-800 mb-2">Erro ao carregar dashboard</h3>
          <p className="text-red-600 mb-6 text-sm">{error}</p>
          <button
            onClick={fetchStats}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium text-sm"
          >
            <RefreshCw size={16} /> Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  // Cálculos seguros com Nullish Coalescing (??) para evitar crash
  const totalProducao = stats?.total_producao ?? 0;
  const producaoStatus = stats?.producao_status ?? [];

  const chartDataStatus = producaoStatus.map(s => ({
    value: Number(s.total),
    name: s.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }));

  const statusChartOption = {
    title: { text: 'Ordens de Produção por Status', left: 'center', textStyle: { fontSize: 14, color: '#4b5563' } },
    tooltip: { trigger: 'item' },
    legend: { bottom: '0%' },
    series: [
      {
        name: 'Status',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
        data: chartDataStatus.length > 0 ? chartDataStatus : [{ value: 0, name: 'Sem dados' }]
      }
    ]
  };

  const barChartOption = {
    title: { text: 'Pipeline de Produção', left: 'center', textStyle: { fontSize: 14, color: '#4b5563' } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: producaoStatus.map(s => s.status.replace(/_/g, ' ')),
      axisLabel: { rotate: 20 }
    },
    yAxis: { type: 'value' },
    series: [
      {
        data: producaoStatus.map(s => Number(s.total)),
        type: 'bar',
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top' }
      }
    ]
  };

  // KPI Calculations (Safe)
  const concluidasProd = producaoStatus.find(s => s.status === 'concluida')?.total ?? 0;
  const emProducao = producaoStatus.find(s => s.status === 'em_producao')?.total ?? 0;
  const totalConcluidas = concluidasProd;
  
  // Eficiência (Exemplo simples: Concluídas / Total)
  const eficiencia = totalProducao > 0 ? Math.round((totalConcluidas / totalProducao) * 100) : 0;

  return (
    <div className="p-1 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Dashboard Industrial</h1>
        <p className="text-gray-600 text-sm mt-1">Visão geral da produção e desempenho.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <KPICard 
          title="Total em Carteira" 
          value={totalProducao} 
          icon={Factory} 
          color="bg-blue-100 text-blue-600" 
          subtext="Ordens ativas"
        />
        <KPICard 
          title="Em Produção" 
          value={emProducao} 
          icon={Factory} 
          color="bg-indigo-100 text-indigo-600" 
          subtext="Ordens liberadas"
        />
        <KPICard 
          title="Taxa de Conclusão" 
          value={`${eficiencia}%`} 
          icon={CheckCircle} 
          color="bg-green-100 text-green-600" 
          subtext={`${totalConcluidas} ordens finalizadas`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={statusChartOption} style={{ height: '100%', width: '100%' }} />
        </GlassCard>
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={barChartOption} style={{ height: '100%', width: '100%' }} />
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
