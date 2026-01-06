import React, { useEffect, useState } from 'react';
import { getDashboardStats, RHDashboardStats, seedRhData, getTrainingCompliance, type TrainingComplianceResponse } from '@/services/rh';
import { Loader2, Users, Briefcase, AlertTriangle, GraduationCap, TrendingDown, DollarSign, DatabaseBackup } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useToast } from '@/contexts/ToastProvider';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useHasPermission } from '@/hooks/useHasPermission';
import { isSeedEnabled } from '@/utils/seed';
import { useNavigate } from 'react-router-dom';

export default function RHDashboard() {
  const navigate = useNavigate();
  const enableSeed = isSeedEnabled();
  const [stats, setStats] = useState<RHDashboardStats | null>(null);
  const [compliance, setCompliance] = useState<TrainingComplianceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const { addToast } = useToast();

  const permManage = useHasPermission('rh', 'manage');
  const canManage = !permManage.isLoading && permManage.data;

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [data, comp] = await Promise.all([getDashboardStats(), getTrainingCompliance(30)]);
      setStats(data);
      setCompliance(comp);
    } catch (error) {
      addToast((error as any)?.message || 'Erro ao carregar dashboard RH.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSeed = async () => {
    if (!canManage) {
      addToast('Você não tem permissão para popular dados de exemplo.', 'warning');
      return;
    }
    setSeeding(true);
    try {
      await seedRhData();
      addToast('Dados de exemplo criados com sucesso!', 'success');
      await fetchStats();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setSeeding(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-12 h-12" />
      </div>
    );
  }

  const isEmpty = stats.total_colaboradores === 0 && stats.total_cargos === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="bg-blue-50 p-6 rounded-full mb-6">
          <DatabaseBackup className="w-16 h-16 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Módulo de RH Vazio</h2>
        <p className="text-gray-600 max-w-md mb-8">
          Parece que você ainda não cadastrou nenhum dado.
          {enableSeed ? ' Que tal popular com dados de exemplo para ver os indicadores em ação?' : ''}
        </p>
        {enableSeed ? (
          <Button onClick={handleSeed} disabled={seeding || permManage.isLoading || !canManage} className="gap-2">
            {seeding ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
            Popular com Dados de Exemplo
          </Button>
        ) : null}
      </div>
    );
  }

  const topGaps = stats.top_gaps ?? [];
  const statusTreinamentos = stats.status_treinamentos ?? [];

  const gapsChartOption = {
    title: { text: 'Top 5 Gaps de Competência', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: topGaps.map(g => g.nome).reverse() },
    series: [
      {
        name: 'Gaps',
        type: 'bar',
        data: topGaps.map(g => g.total_gaps).reverse(),
        itemStyle: { color: '#ef4444', borderRadius: [0, 4, 4, 0] }
      }
    ]
  };

  const statusChartOption = {
    title: { text: 'Status dos Treinamentos', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item' },
    series: [
      {
        name: 'Treinamentos',
        type: 'pie',
        radius: ['40%', '70%'],
        itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
        data: (statusTreinamentos.length > 0 ? statusTreinamentos : [{ status: 'sem_dados', total: 0 }]).map(s => ({
          value: s.total,
          name: s.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }))
      }
    ]
  };

  return (
    <div className="p-1 space-y-6">
      <PageHeader
        title="Dashboard RH & Qualidade"
        description="Visão geral de competências, desenvolvimento e indicadores."
        actions={
          <Button onClick={fetchStats} variant="outline" className="gap-2">
            <RefreshCw size={16} />
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Colaboradores Ativos" 
          value={stats.total_colaboradores} 
          icon={Users} 
          color="bg-blue-100 text-blue-600" 
        />
        <KPICard 
          title="Cargos Definidos" 
          value={stats.total_cargos} 
          icon={Briefcase} 
          color="bg-purple-100 text-purple-600" 
        />
        <KPICard 
          title="Gaps de Competência" 
          value={stats.gaps_identificados} 
          icon={AlertTriangle} 
          color="bg-red-100 text-red-600" 
          subtext="Colaboradores abaixo do nível requerido"
        />
        <KPICard 
          title="Treinamentos Concluídos" 
          value={stats.treinamentos_concluidos} 
          icon={GraduationCap} 
          color="bg-green-100 text-green-600" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={gapsChartOption} style={{ height: '100%', width: '100%' }} />
        </GlassCard>
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={statusChartOption} style={{ height: '100%', width: '100%' }} />
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard className="p-6 flex items-center justify-between bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
          <div>
            <p className="text-gray-600 font-medium">Investimento em Treinamento</p>
            <h3 className="text-3xl font-bold text-emerald-700 mt-2">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.investimento_treinamento)}
            </h3>
            <p className="text-sm text-emerald-600 mt-1">Total realizado</p>
          </div>
          <div className="p-4 bg-white rounded-full shadow-sm">
            <DollarSign size={32} className="text-emerald-500" />
          </div>
        </GlassCard>

        <GlassCard className="p-6 flex flex-col justify-between bg-gradient-to-br from-slate-50 to-blue-50 border-blue-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-gray-600 font-medium">Compliance de Treinamentos</p>
              <p className="text-xs text-gray-500 mt-1">Vencimentos e pendências (próximos 30 dias)</p>
            </div>
            <Button variant="outline" className="h-9" onClick={() => navigate('/app/rh/treinamentos')}>
              Ver treinamentos
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="text-[11px] text-gray-500">OK</div>
              <div className="text-2xl font-bold text-emerald-700">{compliance?.summary?.ok ?? 0}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="text-[11px] text-gray-500">Vencendo</div>
              <div className="text-2xl font-bold text-amber-700">{compliance?.summary?.due_soon ?? 0}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="text-[11px] text-gray-500">Vencido/Pendente</div>
              <div className="text-2xl font-bold text-red-700">{(compliance?.summary?.overdue ?? 0) + (compliance?.summary?.missing ?? 0)}</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-600">
            Dica: defina <span className="font-semibold">trilhas por cargo</span> (Cargos → Treinamentos) para reduzir suporte e padronizar a equipe.
          </div>
        </GlassCard>

        <GlassCard className="p-6 flex flex-col justify-center bg-gradient-to-br from-orange-50 to-amber-50 border-orange-100">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="text-orange-500" />
            <h3 className="font-bold text-gray-800">Ação Recomendada</h3>
          </div>
          <p className="text-gray-600 text-sm">
            {stats.gaps_identificados > 0 
              ? `Existem ${stats.gaps_identificados} gaps de competência críticos. Considere agendar treinamentos para as competências listadas no gráfico ao lado.`
              : "Parabéns! Não foram identificados gaps de competência críticos na equipe atual."}
          </p>
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
