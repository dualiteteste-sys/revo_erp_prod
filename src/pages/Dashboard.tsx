import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Users, ShoppingCart, TrendingUp } from 'lucide-react';
import KPICard from '../components/dashboard/KPICard';
import GraficoFaturamento from '../components/dashboard/GraficoFaturamento';
import AtividadesRecentes from '../components/dashboard/AtividadesRecentes';
import GraficoVendas from '../components/dashboard/GraficoVendas';
import RankingCategorias from '../components/dashboard/RankingCategorias';
import GraficoPagarReceber from '../components/dashboard/GraficoPagarReceber';
import { getMainDashboardData } from '@/services/mainDashboard';
import { formatCurrency } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { useHasPermission } from '@/hooks/useHasPermission';

const formatMoney = (value: number) => formatCurrency(Math.round(Number(value || 0) * 100));

function pctDelta(current: number, previous: number) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (p === 0 && c === 0) return 0;
  if (p === 0) return 100;
  return ((c - p) / p) * 100;
}

function formatTrend(deltaPct: number) {
  const sign = deltaPct >= 0 ? '+' : '';
  return `${sign}${deltaPct.toFixed(1)}%`;
}

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMainDashboardData>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opsView = useHasPermission('ops', 'view');
  const includeActivities = !!opsView.data;

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getMainDashboardData({ activitiesLimit: includeActivities ? 12 : 0 });
        if (mounted) setData(res);
      } catch (e: any) {
        // Dashboard é "best-effort": não deve poluir console/error sweep nem travar fluxos críticos.
        logger.warn('[Dashboard] erro ao carregar dados', { message: e?.message || String(e || '') });
        if (mounted) setError(e?.message || 'Não foi possível carregar o dashboard.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [includeActivities]);

  const kpiData = useMemo(() => {
    if (!data) return [];
    const curr = data.current?.kpis;
    const prev = data.previous?.kpis;
    const faturamentoDelta = pctDelta(curr?.faturamento_total ?? 0, prev?.faturamento_total ?? 0);
    const clientesDelta = pctDelta(curr?.clientes_ativos ?? 0, prev?.clientes_ativos ?? 0);
    const pedidosDelta = pctDelta(curr?.pedidos_concluidos ?? 0, prev?.pedidos_concluidos ?? 0);
    const ticketDelta = pctDelta(curr?.ticket_medio ?? 0, prev?.ticket_medio ?? 0);

    return [
      {
        title: 'Faturamento do Mês',
        value: formatMoney(curr?.faturamento_total ?? 0),
        trend: formatTrend(faturamentoDelta),
        isPositive: faturamentoDelta >= 0,
        icon: DollarSign,
        iconBg: 'from-blue-100 to-blue-200',
        iconColor: 'text-blue-600',
      },
      {
        title: 'Clientes Ativos',
        value: String(curr?.clientes_ativos ?? 0),
        trend: formatTrend(clientesDelta),
        isPositive: clientesDelta >= 0,
        icon: Users,
        iconBg: 'from-green-100 to-green-200',
        iconColor: 'text-green-600',
      },
      {
        title: 'Pedidos Concluídos',
        value: String(curr?.pedidos_concluidos ?? 0),
        trend: formatTrend(pedidosDelta),
        isPositive: pedidosDelta >= 0,
        icon: ShoppingCart,
        iconBg: 'from-orange-100 to-orange-200',
        iconColor: 'text-orange-600',
      },
      {
        title: 'Ticket Médio',
        value: formatMoney(curr?.ticket_medio ?? 0),
        trend: formatTrend(ticketDelta),
        isPositive: ticketDelta >= 0,
        icon: TrendingUp,
        iconBg: 'from-purple-100 to-purple-200',
        iconColor: 'text-purple-600',
      },
    ];
  }, [data]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
      {error ? (
        <div className="lg:col-span-12">
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        </div>
      ) : null}

      {(loading ? new Array(4).fill(null) : kpiData).map((kpi, index) => (
        <div key={index} className="lg:col-span-3 sm:col-span-6">
          <KPICard
            {...(kpi ?? {
              title: '—',
              value: '—',
              trend: '—',
              isPositive: true,
              icon: DollarSign,
              iconBg: 'from-slate-100 to-slate-200',
              iconColor: 'text-slate-600',
            })}
            index={index}
            loading={loading}
          />
        </div>
      ))}

      <div className="lg:col-span-8">
        <GraficoFaturamento series={data?.current?.series ?? []} loading={loading} />
      </div>

      <div className="lg:col-span-4">
        <AtividadesRecentes activities={data?.activities ?? []} loading={loading} />
      </div>
      
      <div className="lg:col-span-5">
        <GraficoVendas status={data?.current?.status ?? []} loading={loading} />
      </div>

      <div className="lg:col-span-7">
        <RankingCategorias topProducts={data?.current?.top_produtos ?? []} loading={loading} />
      </div>

      <div className="lg:col-span-12">
        <GraficoPagarReceber series={data?.financeiroPagarReceber3m ?? []} loading={loading} />
      </div>
    </div>
  );
};

export default Dashboard;
