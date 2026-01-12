import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, DollarSign, ShoppingCart, Users } from 'lucide-react';
import KPICard from '../components/dashboard/KPICard';
import SalesLineChart from '../components/sales-dashboard/SalesLineChart';
import TopSellersChart from '../components/sales-dashboard/TopSellersChart';
import TopProductsChart from '../components/sales-dashboard/TopProductsChart';
import PageHeader from '@/components/ui/PageHeader';
import Select from '@/components/ui/forms/Select';
import Input from '@/components/ui/forms/Input';
import { Loader2 } from 'lucide-react';
import { getVendasDashboardStats, type VendasDashboardStats } from '@/services/salesDashboard';
import { useToast } from '@/contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function formatPct(delta: number | null) {
  if (delta === null || Number.isNaN(delta)) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

function dateToISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

type Preset = '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'ytd' | 'custom';

export default function SalesDashboard() {
  const supabase = useSupabase() as any;
  const { addToast } = useToast();

  const [preset, setPreset] = useState<Preset>('30d');
  const [startDate, setStartDate] = useState(() => dateToISO(new Date(Date.now() - 30 * 86400000)));
  const [endDate, setEndDate] = useState(() => dateToISO(new Date()));
  const [canal, setCanal] = useState<'all' | 'erp' | 'pdv'>('all');
  const [vendedorId, setVendedorId] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<VendasDashboardStats | null>(null);
  const [prevStats, setPrevStats] = useState<VendasDashboardStats | null>(null);

  const [vendedores, setVendedores] = useState<Array<{ id: string; nome: string }>>([]);

  useEffect(() => {
    // Lista vendedores para filtro (se não existir, o filtro funciona como "Todos")
    supabase
      .from('vendedores')
      .select('id,nome')
      .order('nome', { ascending: true })
      .limit(500)
      .then(({ data, error }: any) => {
        if (error) return;
        setVendedores((data || []) as any);
      });
  }, [supabase]);

  useEffect(() => {
    const now = new Date();
    if (preset === 'custom') return;

    if (preset === '7d') {
      setStartDate(dateToISO(new Date(Date.now() - 7 * 86400000)));
      setEndDate(dateToISO(now));
      return;
    }
    if (preset === '30d') {
      setStartDate(dateToISO(new Date(Date.now() - 30 * 86400000)));
      setEndDate(dateToISO(now));
      return;
    }
    if (preset === '90d') {
      setStartDate(dateToISO(new Date(Date.now() - 90 * 86400000)));
      setEndDate(dateToISO(now));
      return;
    }
    if (preset === 'this_month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(dateToISO(first));
      setEndDate(dateToISO(now));
      return;
    }
    if (preset === 'last_month') {
      const firstLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastLast = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(dateToISO(firstLast));
      setEndDate(dateToISO(lastLast));
      return;
    }
    if (preset === 'ytd') {
      const first = new Date(now.getFullYear(), 0, 1);
      setStartDate(dateToISO(first));
      setEndDate(dateToISO(now));
      return;
    }
  }, [preset]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
        const prevEnd = new Date(start.getTime() - 86400000);
        const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);

        const params = {
          startDate,
          endDate,
          canal: canal === 'all' ? null : canal,
          vendedorId: vendedorId || null,
        } as const;

        const prevParams = {
          startDate: dateToISO(prevStart),
          endDate: dateToISO(prevEnd),
          canal: canal === 'all' ? null : canal,
          vendedorId: vendedorId || null,
        } as const;

        const [curr, prev] = await Promise.all([getVendasDashboardStats(params), getVendasDashboardStats(prevParams)]);
        if (cancelled) return;
        setStats(curr);
        setPrevStats(prev);
      } catch (e: any) {
        if (!cancelled) {
          addToast(e?.message || 'Falha ao carregar painel de vendas.', 'error');
          setStats(null);
          setPrevStats(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // debounce simples
    const t = setTimeout(() => void run(), 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [addToast, canal, endDate, startDate, vendedorId]);

  const kpis = useMemo(() => {
    const curr = stats?.kpis;
    const prev = prevStats?.kpis;
    if (!curr) return [];

    const faturDelta = prev && prev.faturamento_total > 0 ? ((curr.faturamento_total - prev.faturamento_total) / prev.faturamento_total) * 100 : null;
    const ticketDelta = prev && prev.ticket_medio > 0 ? ((curr.ticket_medio - prev.ticket_medio) / prev.ticket_medio) * 100 : null;
    const pedidosDelta = prev ? curr.pedidos_concluidos - prev.pedidos_concluidos : null;
    const clientesDelta = prev ? curr.clientes_ativos - prev.clientes_ativos : null;

    return [
      {
        title: 'Faturamento Total',
        value: formatCurrency(curr.faturamento_total),
        trend: formatPct(faturDelta),
        isPositive: faturDelta === null ? true : faturDelta >= 0,
        icon: DollarSign,
        iconBg: 'from-blue-100 to-blue-200',
        iconColor: 'text-blue-600',
      },
      {
        title: 'Ticket Médio',
        value: formatCurrency(curr.ticket_medio),
        trend: formatPct(ticketDelta),
        isPositive: ticketDelta === null ? true : ticketDelta >= 0,
        icon: BarChart3,
        iconBg: 'from-green-100 to-green-200',
        iconColor: 'text-green-600',
      },
      {
        title: 'Pedidos Concluídos',
        value: String(curr.pedidos_concluidos),
        trend: pedidosDelta === null ? '—' : `${pedidosDelta >= 0 ? '+' : ''}${pedidosDelta}`,
        isPositive: pedidosDelta === null ? true : pedidosDelta >= 0,
        icon: ShoppingCart,
        iconBg: 'from-orange-100 to-orange-200',
        iconColor: 'text-orange-600',
      },
      {
        title: 'Clientes Ativos',
        value: String(curr.clientes_ativos),
        trend: clientesDelta === null ? '—' : `${clientesDelta >= 0 ? '+' : ''}${clientesDelta}`,
        isPositive: clientesDelta === null ? true : clientesDelta >= 0,
        icon: Users,
        iconBg: 'from-purple-100 to-purple-200',
        iconColor: 'text-purple-600',
      },
    ];
  }, [stats, prevStats]);

  const line = useMemo(() => {
    const labels = (stats?.series || []).map((s) => s.label);
    const values = (stats?.series || []).map((s) => Number(s.total || 0));
    return { labels, values };
  }, [stats]);

  const topVendedores = useMemo(() => {
    return (stats?.top_vendedores || []).map((v) => ({ name: v.nome || '—', value: Number(v.total || 0) }));
  }, [stats]);

  const topProdutos = useMemo(() => {
    return (stats?.top_produtos || []).map((p) => ({ name: p.nome || '—', value: Number(p.total || 0) }));
  }, [stats]);

  return (
    <div className="p-1">
      <div className="mb-6">
        <PageHeader
          title="Painel de Vendas"
          description="KPIs e visão consolidada por período, canal e vendedor."
          icon={<BarChart3 size={20} />}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Período</label>
          <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="this_month">Este mês</option>
            <option value="last_month">Mês passado</option>
            <option value="ytd">Ano (YTD)</option>
            <option value="custom">Personalizado</option>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Canal</label>
          <Select value={canal} onChange={(e) => setCanal(e.target.value as any)}>
            <option value="all">Todos</option>
            <option value="erp">ERP</option>
            <option value="pdv">PDV</option>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Vendedor</label>
          <Select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
            <option value="">Todos</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Início"
            name="startDate"
            type="date"
            size="sm"
            value={startDate}
            onChange={(e) => {
              setPreset('custom');
              setStartDate(e.target.value);
            }}
          />
          <Input
            label="Fim"
            name="endDate"
            type="date"
            size="sm"
            value={endDate}
            onChange={(e) => {
              setPreset('custom');
              setEndDate(e.target.value);
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="h-56 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {kpis.map((kpi, index) => (
            <div key={kpi.title} className="lg:col-span-3 sm:col-span-6">
              <KPICard {...kpi} index={index} />
            </div>
          ))}

          <div className="lg:col-span-12">
            <SalesLineChart labels={line.labels} values={line.values} />
          </div>

          <div className="lg:col-span-7">
            <TopSellersChart items={topVendedores} />
          </div>

          <div className="lg:col-span-5">
            <TopProductsChart items={topProdutos} />
          </div>
        </div>
      )}
    </div>
  );
}
