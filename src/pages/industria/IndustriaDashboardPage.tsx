import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getDashboardStats, DashboardStats, listOrdens, type OrdemIndustria } from '@/services/industria';
import { AlertCircle, CheckCircle, Factory, RefreshCw, Activity, Eye, ShieldAlert } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { logger } from '@/lib/logger';
import { formatOrderNumber } from '@/lib/utils';

export default function IndustriaDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [benefOrders, setBenefOrders] = useState<OrdemIndustria[]>([]);
  const [benefLoading, setBenefLoading] = useState(false);
  const [benefError, setBenefError] = useState<string | null>(null);

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

  const fetchBenefOrdens = useCallback(async () => {
    setBenefLoading(true);
    setBenefError(null);
    try {
      const data = await listOrdens('', 'beneficiamento', '');
      setBenefOrders(data || []);
    } catch (err: any) {
      logger.error('[Indústria][Dashboard] Falha ao carregar beneficiamento', err);
      setBenefError(err.message || 'Erro ao carregar ordens de beneficiamento.');
    } finally {
      setBenefLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchBenefOrdens();
  }, [fetchBenefOrdens]);

  // Cálculos seguros com Nullish Coalescing (??) para evitar crash
  const totalProducao = stats?.total_producao ?? 0;
  const producaoStatus = stats?.producao_status ?? [];
  const beneficiamentoStatus = stats?.beneficiamento_status ?? [];

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

  const count = useCallback((arr: { status: string; total: number }[], key: string) => {
    return Number(arr.find(s => s.status === key)?.total ?? 0);
  }, []);

  const wipCards = useMemo(() => {
    const keys = [
      { key: 'em_programacao', label: 'Em Programação', color: 'bg-amber-100 text-amber-700' },
      { key: 'em_producao', label: 'Em Produção', color: 'bg-blue-100 text-blue-700' },
      { key: 'em_inspecao', label: 'Em Inspeção', color: 'bg-purple-100 text-purple-700' },
      { key: 'em_beneficiamento', label: 'Em Beneficiamento', color: 'bg-cyan-100 text-cyan-700' },
      { key: 'parcialmente_concluida', label: 'Parcialmente Concluída', color: 'bg-emerald-100 text-emerald-700' },
    ];
    return keys.map(k => ({
      ...k,
      total: count(producaoStatus, k.key) + count(beneficiamentoStatus, k.key),
    }));
  }, [beneficiamentoStatus, producaoStatus, count]);

  const qaPendente = count(producaoStatus, 'em_inspecao') + count(beneficiamentoStatus, 'em_inspecao');

  const benefEmAndamento = useMemo(
    () => benefOrders.filter(o => o.status !== 'concluida' && o.status !== 'cancelada'),
    [benefOrders]
  );

  const benefSaldoPorCliente = useMemo(() => {
    const map: Record<string, number> = {};
    benefEmAndamento.forEach(o => {
      const key = o.cliente_nome || 'Sem cliente';
      const saldo = Math.max((o.quantidade_planejada ?? 0) - (o.total_entregue ?? 0), 0);
      map[key] = (map[key] || 0) + saldo;
    });
    return Object.entries(map).map(([cliente, saldo]) => ({ cliente, saldo }));
  }, [benefEmAndamento]);

  const benefChartOption = {
    title: { text: 'Saldo por Cliente (Beneficiamento)', left: 'center', textStyle: { fontSize: 14, color: '#4b5563' } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: benefSaldoPorCliente.map(i => i.cliente), axisLabel: { rotate: 20 } },
    yAxis: { type: 'value' },
    series: [
      {
        data: benefSaldoPorCliente.map(i => i.saldo),
        type: 'bar',
        itemStyle: { color: '#06b6d4', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top' }
      }
    ]
  };

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
          <Button onClick={fetchStats} variant="destructive" className="gap-2">
            <RefreshCw size={16} /> Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

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
        <KPICard 
          title="QA / Inspeções Pendentes" 
          value={qaPendente} 
          icon={ShieldAlert} 
          color="bg-amber-100 text-amber-700" 
          subtext="Ordens aguardando inspeção"
        />
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Trabalhos em andamento</h3>
            <p className="text-sm text-gray-500">Distribuição consolidada (industrialização + beneficiamento)</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Eye size={14} /> Visão rápida de chão de fábrica
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {wipCards.map(card => (
            <div key={card.key} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${card.color}`}>{card.label}</span>
                <Activity className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-3xl font-bold text-gray-800 mt-2">{card.total}</div>
              <div className="text-xs text-gray-500 mt-1">ordens</div>
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={statusChartOption} style={{ height: '100%', width: '100%' }} />
        </GlassCard>
        <GlassCard className="p-4 min-h-[350px]">
          <ReactECharts option={barChartOption} style={{ height: '100%', width: '100%' }} />
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Beneficiamento - Trabalhos em andamento</h3>
            <p className="text-sm text-gray-500">
              Itens pendentes por cliente com saldo e documentos de entrada.
            </p>
          </div>
          <div className="text-xs text-gray-500">
            {benefLoading ? 'Atualizando...' : benefError ? benefError : `${benefEmAndamento.length} ordens`}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
            <p className="text-xs text-cyan-700 font-semibold">Saldo a entregar (un)</p>
            <p className="text-2xl font-bold text-cyan-800">
              {benefEmAndamento.reduce((acc, o) => acc + Math.max((o.quantidade_planejada ?? 0) - (o.total_entregue ?? 0), 0), 0)}
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs text-amber-700 font-semibold">NF registradas</p>
            <p className="text-lg font-bold text-amber-800">Usando doc. ref. das ordens</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <p className="text-xs text-emerald-700 font-semibold">Pedidos vinculados</p>
            <p className="text-lg font-bold text-emerald-800">Monitoramento consolidado</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Itens em produção</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Qtde. Caixas</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">OP</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Qtde. NF Cliente</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">NF</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Pedido</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Data de entrada</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Saldo (A entregar)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {benefEmAndamento.map((o) => {
                  const saldo = Math.max((o.quantidade_planejada ?? 0) - (o.total_entregue ?? 0), 0);
                  const qtdeCaixas = (o as any)?.qtde_caixas ?? '—';
                  const nfNumero = o.documento_ref || '—';
                  const pedidoNumero = (o as any)?.pedido_numero || '—';
                  const dataEntrada = (o as any)?.created_at || o.data_prevista_inicio || '';
                  return (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-800">{o.quantidade_planejada ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-800">{qtdeCaixas}</td>
                      <td className="px-3 py-2 text-gray-800 font-semibold">{formatOrderNumber(o.numero)}</td>
                      <td className="px-3 py-2 text-gray-700">{o.cliente_nome || '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{o.total_entregue ?? 0}</td>
                      <td className="px-3 py-2 text-gray-700">{nfNumero}</td>
                      <td className="px-3 py-2 text-gray-700">{pedidoNumero}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {dataEntrada ? new Date(dataEntrada).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-800 font-semibold">{saldo}</td>
                    </tr>
                  );
                })}
                {benefEmAndamento.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-gray-500 text-sm">
                      Nenhuma ordem de beneficiamento em andamento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-gray-100 rounded-xl p-3 min-h-[320px]">
            <ReactECharts option={benefChartOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      </GlassCard>

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
