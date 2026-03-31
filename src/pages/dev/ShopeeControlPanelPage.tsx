import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import {
  getShopeeAccountInfo,
  getShopeeHealthCheck,
  listShopeeOrders,
  type ShopeeAccountInfo,
  type ShopeeHealthCheck,
  type ShopeeOrderRow,
} from '@/services/shopeeAdmin';
import {
  listEcommerceImportJobs,
  cancelEcommerceImportJob,
  retryEcommerceImportJob,
  enqueueEcommerceImportJob,
  type EcommerceImportJob,
  type EcommerceImportJobStatus,
} from '@/services/ecommerceImportJobs';
import { listEcommerceConnections, type EcommerceConnection } from '@/services/ecommerceIntegrations';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Zap,
  Package,
  Clock,
  User,
  ShoppingCart,
  RotateCcw,
  Ban,
  Play,
  Search,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'queue' | 'orders';

export default function ShopeeControlPanelPage() {
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [shopeeConn, setShopeeConn] = useState<EcommerceConnection | null>(null);
  const [account, setAccount] = useState<ShopeeAccountInfo | null>(null);
  const [health, setHealth] = useState<ShopeeHealthCheck | null>(null);
  const [loading, setLoading] = useState(true);

  // Queue state
  const [jobs, setJobs] = useState<EcommerceImportJob[]>([]);
  const [jobFilter, setJobFilter] = useState<EcommerceImportJobStatus | 'all'>('all');
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobActionLoading, setJobActionLoading] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Orders state
  const [orders, setOrders] = useState<ShopeeOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState('');
  const ordersDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const empresaId = activeEmpresaId || '';
  const ecommerceId = shopeeConn?.id || '';

  // Load connection
  useEffect(() => {
    if (!activeEmpresaId) return;
    listEcommerceConnections()
      .then((conns) => {
        const shopee = conns.find((c) => c.provider === 'shopee');
        setShopeeConn(shopee || null);
      })
      .catch(console.error);
  }, [activeEmpresaId]);

  // Load overview data
  useEffect(() => {
    if (!empresaId || !ecommerceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      getShopeeAccountInfo(empresaId, ecommerceId).catch(() => null),
      getShopeeHealthCheck(empresaId, ecommerceId).catch(() => null),
    ]).then(([acc, hlth]) => {
      if (acc?.data) setAccount(acc.data);
      if (hlth) setHealth(hlth);
    }).finally(() => setLoading(false));
  }, [empresaId, ecommerceId]);

  // -------------------------------------------------------------------------
  // Queue tab
  // -------------------------------------------------------------------------
  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const data = await listEcommerceImportJobs({
        provider: 'shopee',
        status: jobFilter === 'all' ? null : jobFilter,
        limit: 50,
      });
      setJobs(data ?? []);
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, [jobFilter]);

  useEffect(() => {
    if (tab === 'queue') loadJobs();
  }, [tab, loadJobs]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tab === 'queue') {
      const hasPending = jobs.some((j) => j.status === 'pending' || j.status === 'processing');
      if (hasPending) {
        pollRef.current = setInterval(loadJobs, 10_000);
      }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tab, jobs, loadJobs]);

  const handleRetryJob = async (jobId: string) => {
    setJobActionLoading(jobId);
    try {
      await retryEcommerceImportJob(jobId, 'Retry manual via painel Shopee');
      addToast('Job reenfileirado com sucesso.', 'success');
      await loadJobs();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao reenfileirar.', 'error');
    } finally {
      setJobActionLoading(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    setJobActionLoading(jobId);
    try {
      await cancelEcommerceImportJob(jobId);
      addToast('Job cancelado.', 'success');
      await loadJobs();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao cancelar.', 'error');
    } finally {
      setJobActionLoading(null);
    }
  };

  const handleEnqueueImport = async () => {
    setJobActionLoading('enqueue');
    try {
      await enqueueEcommerceImportJob({ provider: 'shopee', kind: 'import_orders' });
      addToast('Job de importação de pedidos Shopee criado.', 'success');
      await loadJobs();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao criar job.', 'error');
    } finally {
      setJobActionLoading(null);
    }
  };

  // -------------------------------------------------------------------------
  // Orders tab
  // -------------------------------------------------------------------------
  const loadOrders = useCallback(async (q?: string) => {
    setOrdersLoading(true);
    try {
      const data = await listShopeeOrders({ q: q || undefined, limit: 100 });
      setOrders(data ?? []);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'orders') loadOrders(ordersSearch);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'orders') return;
    if (ordersDebounceRef.current) clearTimeout(ordersDebounceRef.current);
    ordersDebounceRef.current = setTimeout(() => loadOrders(ordersSearch), 300);
    return () => { if (ordersDebounceRef.current) clearTimeout(ordersDebounceRef.current); };
  }, [ordersSearch, loadOrders, tab]);

  // -------------------------------------------------------------------------
  // No connection state
  // -------------------------------------------------------------------------
  if (!shopeeConn) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Shopee — Painel de Controle</h1>
        <GlassCard className="p-8 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Nenhuma conexão Shopee encontrada.</p>
          <p className="text-sm text-gray-400 mt-2">
            Configure a integração em Configurações &gt; Integrações.
          </p>
        </GlassCard>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Visão Geral', icon: Activity },
    { key: 'queue', label: 'Fila', icon: RefreshCw },
    { key: 'orders', label: 'Pedidos Shopee', icon: ShoppingCart },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Shopee — Painel de Controle</h1>
        <div className="flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
            shopeeConn.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800',
          )}>
            {shopeeConn.status === 'connected' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {shopeeConn.status}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200/60">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === t.key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {loading && tab === 'overview' ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-orange-500" />
        </div>
      ) : (
        <>
          {/* ============================================================= */}
          {/* Overview Tab                                                   */}
          {/* ============================================================= */}
          {tab === 'overview' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <GlassCard className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <User size={16} />
                  Conta Shopee
                </div>
                {account ? (
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-gray-900">
                      {account.shop_name || `Shop #${account.shop_id}`}
                    </p>
                    {account.region && (
                      <p className="text-xs text-gray-500">Região: {account.region}</p>
                    )}
                    {account.status && (
                      <p className="text-xs text-gray-500">Status: {account.status}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Não disponível</p>
                )}
              </GlassCard>

              <GlassCard className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Activity size={16} />
                  Saúde da API
                </div>
                {health ? (
                  <div className="space-y-2">
                    <StatusBadge ok={health.api_status === 'connected'} label="API Shopee" />
                    <div className="text-xs text-gray-500">
                      Última sync: {health.health?.last_sync_at
                        ? new Date(health.health.last_sync_at).toLocaleString('pt-BR')
                        : 'Nunca'}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Sem dados</p>
                )}
              </GlassCard>

              <GlassCard className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Zap size={16} />
                  Fila de Jobs
                </div>
                {health?.health ? (
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <KPIMini value={health.health.pending} label="Pendentes" color="text-amber-600" />
                    <KPIMini value={health.health.failed_24h} label="Falhas 24h" color="text-red-600" />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Sem dados</p>
                )}
              </GlassCard>
            </div>
          )}

          {/* ============================================================= */}
          {/* Queue Tab                                                      */}
          {/* ============================================================= */}
          {tab === 'queue' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {(['all', 'pending', 'processing', 'done', 'error', 'dead', 'canceled'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setJobFilter(s)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        jobFilter === s
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100/60 text-gray-500 hover:bg-gray-200/60',
                      )}
                    >
                      {s === 'all' ? 'Todos' : s === 'pending' ? 'Pendentes' : s === 'processing' ? 'Processando' : s === 'done' ? 'Concluídos' : s === 'error' ? 'Erro' : s === 'dead' ? 'Dead' : 'Cancelados'}
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnqueueImport}
                  disabled={jobActionLoading === 'enqueue'}
                >
                  {jobActionLoading === 'enqueue' ? <Loader2 size={14} className="animate-spin mr-1" /> : <Play size={14} className="mr-1" />}
                  Importar Pedidos Agora
                </Button>
              </div>

              <GlassCard className="overflow-hidden">
                {jobsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-orange-500" />
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="py-12 text-center">
                    <Clock size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">Nenhum job na fila.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200/40 bg-gray-50/30">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Tentativas</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Próx. Retry</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Último Erro</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Criado</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200/30">
                        {jobs.map((job) => (
                          <tr key={job.id} className="hover:bg-white/40 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs bg-gray-100 rounded px-2 py-0.5">{job.kind}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <JobStatusBadge status={job.status} />
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-gray-600">
                              {job.attempts}/{job.max_attempts}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {job.next_retry_at ? new Date(job.next_retry_at).toLocaleString('pt-BR') : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-red-500 max-w-[200px] truncate">
                              {job.last_error || '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {new Date(job.created_at).toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {(job.status === 'error' || job.status === 'dead' || job.status === 'canceled') && (
                                  <button
                                    onClick={() => handleRetryJob(job.id)}
                                    disabled={jobActionLoading === job.id}
                                    className="p-1 text-orange-500 hover:text-orange-700 disabled:opacity-50"
                                    title="Retry"
                                  >
                                    {jobActionLoading === job.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                                  </button>
                                )}
                                {(job.status === 'pending' || job.status === 'processing') && (
                                  <button
                                    onClick={() => handleCancelJob(job.id)}
                                    disabled={jobActionLoading === job.id}
                                    className="p-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                                    title="Cancelar"
                                  >
                                    {jobActionLoading === job.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </GlassCard>
            </div>
          )}

          {/* ============================================================= */}
          {/* Orders Tab                                                     */}
          {/* ============================================================= */}
          {tab === 'orders' && (
            <div className="space-y-4">
              <div className="relative max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-200/80 bg-white/70 backdrop-blur-sm pl-10 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100 focus:outline-none"
                  placeholder="Buscar por número, cliente ou ID Shopee..."
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                />
              </div>

              <GlassCard className="overflow-hidden">
                {ordersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-orange-500" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="py-12 text-center">
                    <ShoppingCart size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">
                      {ordersSearch ? 'Nenhum pedido encontrado para essa busca.' : 'Nenhum pedido importado do Shopee.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200/40 bg-gray-50/30">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase"># Pedido</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cliente</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status Shopee</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Order SN</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Importado em</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200/30">
                        {orders.map((o) => (
                          <tr key={o.pedido_id} className="hover:bg-white/40 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-mono font-medium text-gray-800">
                                {o.numero || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                              {o.cliente_nome || '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <OrderStatusBadge status={o.status} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-xs font-mono bg-orange-50 text-orange-700 rounded px-2 py-0.5">
                                {o.shopee_status || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-800">
                              R$ {Number(o.total_geral ?? 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-xs font-mono text-orange-500">
                                {o.external_order_id}
                                <ExternalLink size={10} />
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {o.imported_at ? new Date(o.imported_at).toLocaleString('pt-BR') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </GlassCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-lg px-2 py-1',
      ok ? 'bg-green-50/80 text-green-700' : 'bg-red-50/80 text-red-700',
    )}>
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function KPIMini({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="py-1">
      <p className={cn('text-xl font-bold', color || 'text-gray-900')}>{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    processing: 'bg-orange-100 text-orange-700',
    done: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    dead: 'bg-rose-100 text-rose-800',
    canceled: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-semibold', styles[status] || styles.pending)}>
      {status}
    </span>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    rascunho: 'bg-gray-100 text-gray-700',
    pendente: 'bg-amber-100 text-amber-700',
    confirmado: 'bg-blue-100 text-blue-700',
    faturado: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-700',
    entregue: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-semibold', styles[status] || 'bg-gray-100 text-gray-600')}>
      {status}
    </span>
  );
}
