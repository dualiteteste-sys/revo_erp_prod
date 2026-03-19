import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import NfeStatusBadge from '@/components/fiscal/NfeStatusBadge';
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  DollarSign,
  Filter,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { callRpc } from '@/lib/api';
import { Link } from 'react-router-dom';

type DashboardKpis = {
  ok: boolean;
  periodo_inicio: string;
  periodo_fim: string;
  totais_por_status: Record<string, number>;
  valor_autorizado: number;
  total_autorizadas: number;
  pendentes: number;
  rejeitadas_periodo: number;
  erros_periodo: number;
  regras_fiscais_ativas: number;
  ibs_cbs_enabled: boolean;
};

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function KpiCard({ title, value, subtitle, icon, color, href }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  href?: string;
}) {
  const content = (
    <GlassCard className={`p-5 border-l-4 ${color} ${href ? 'hover:bg-slate-50/80 transition-colors cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className="p-2 rounded-lg bg-slate-50">
          {icon}
        </div>
      </div>
    </GlassCard>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }
  return content;
}

const FiscalDashboardPage: React.FC = () => {
  const { activeEmpresaId, loading: authLoading } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0]);

  const canShow = !authLoading && !!activeEmpresaId;

  const fetchKpis = useCallback(async () => {
    if (!activeEmpresaId) return;
    setLoading(true);
    try {
      const data = await callRpc<DashboardKpis>('fiscal_dashboard_kpis', {
        p_data_inicio: dataInicio || null,
        p_data_fim: dataFim || null,
      });
      setKpis(data);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar dashboard fiscal.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, dataInicio, dataFim, addToast]);

  useEffect(() => {
    if (canShow) fetchKpis();
  }, [canShow, fetchKpis]);

  if (!canShow) {
    return (
      <div className="p-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-700">Selecione uma empresa ativa para visualizar o dashboard fiscal.</p>
        </GlassCard>
      </div>
    );
  }

  const statusEntries = kpis?.totais_por_status
    ? Object.entries(kpis.totais_por_status).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div className="p-1">
      <PageHeader
        title="Dashboard Fiscal"
        description="Visão geral das emissões fiscais, pendências e indicadores do período."
        icon={<BarChart3 size={20} />}
        actions={
          <Button variant="secondary" onClick={fetchKpis} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin mr-1" /> : <RefreshCw size={16} className="mr-1" />}
            Atualizar
          </Button>
        }
      />

      {/* Filtro de período */}
      <GlassCard className="mb-4 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Fim</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button variant="secondary" onClick={fetchKpis} disabled={loading}>
            Filtrar
          </Button>
        </div>
      </GlassCard>

      {loading && !kpis ? (
        <GlassCard className="p-8 text-center">
          <Loader2 className="mx-auto animate-spin" size={32} />
          <p className="mt-3 text-sm text-slate-500">Carregando indicadores...</p>
        </GlassCard>
      ) : kpis ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard
              title="Valor Autorizado"
              value={formatCurrency(kpis.valor_autorizado)}
              subtitle={`${kpis.total_autorizadas} NF-e no período`}
              icon={<DollarSign size={20} className="text-emerald-600" />}
              color="border-emerald-500"
              href="/app/fiscal/nfe"
            />
            <KpiCard
              title="Pendentes"
              value={kpis.pendentes}
              subtitle="Pré-NF-e aguardando ação"
              icon={<Clock size={20} className="text-blue-600" />}
              color="border-blue-500"
              href="/app/fiscal/nfe"
            />
            <KpiCard
              title="Rejeitadas"
              value={kpis.rejeitadas_periodo}
              subtitle="No período selecionado"
              icon={<XCircle size={20} className="text-red-600" />}
              color="border-red-500"
              href="/app/fiscal/nfe"
            />
            <KpiCard
              title="Regras Fiscais"
              value={kpis.regras_fiscais_ativas}
              subtitle="Regras ativas"
              icon={<Filter size={20} className="text-violet-600" />}
              color="border-violet-500"
              href="/app/fiscal/regras"
            />
          </div>

          {/* Status breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Emissões por Status (período)</h3>
              {statusEntries.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma emissão no período.</p>
              ) : (
                <div className="space-y-3">
                  {statusEntries.map(([status, count]) => {
                    const total = statusEntries.reduce((s, [, c]) => s + c, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1">
                          <NfeStatusBadge status={status} />
                          <span className="text-sm font-semibold text-slate-700">{count}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Status do Módulo</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">IBS/CBS 2026</span>
                  {kpis.ibs_cbs_enabled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle2 size={12} /> Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                      Desativado
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">Regras Fiscais</span>
                  <span className="text-sm font-semibold text-slate-700">{kpis.regras_fiscais_ativas} ativas</span>
                </div>
                {kpis.erros_periodo > 0 && (
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <span className="text-sm text-red-600 flex items-center gap-1">
                      <AlertTriangle size={14} /> Erros no período
                    </span>
                    <span className="text-sm font-semibold text-red-700">{kpis.erros_periodo}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Atalhos</h4>
                <div className="flex flex-wrap gap-2">
                  <Link to="/app/fiscal/nfe" className="text-xs text-blue-600 hover:underline">NF-e</Link>
                  <Link to="/app/fiscal/regras" className="text-xs text-blue-600 hover:underline">Regras Fiscais</Link>
                  <Link to="/app/fiscal/naturezas-operacao" className="text-xs text-blue-600 hover:underline">Naturezas</Link>
                  <Link to="/app/fiscal/nfe/configuracoes" className="text-xs text-blue-600 hover:underline">Configurações</Link>
                </div>
              </div>
            </GlassCard>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default FiscalDashboardPage;
