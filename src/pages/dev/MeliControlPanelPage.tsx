import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import {
  getMeliAccountInfo,
  getMeliHealthCheck,
  listMeliQuestions,
  answerMeliQuestion,
  type MeliAccountInfo,
  type MeliHealthCheck,
  type MeliQuestion,
} from '@/services/meliAdmin';
import {
  listMeliWebhookEvents,
  getMeliHealthSummary,
  listMeliOrders,
  type MeliWebhookEvent,
  type MeliHealthSummary,
  type MeliOrderRow,
} from '@/services/meliCategories';
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
  MessageCircle,
  Send,
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

type Tab = 'overview' | 'queue' | 'orders' | 'questions' | 'webhooks';

export default function MeliControlPanelPage() {
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [meliConn, setMeliConn] = useState<EcommerceConnection | null>(null);
  const [account, setAccount] = useState<MeliAccountInfo | null>(null);
  const [health, setHealth] = useState<MeliHealthCheck | null>(null);
  const [summary, setSummary] = useState<MeliHealthSummary | null>(null);
  const [events, setEvents] = useState<MeliWebhookEvent[]>([]);
  const [questions, setQuestions] = useState<MeliQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [answerText, setAnswerText] = useState<Record<number, string>>({});
  const [answering, setAnswering] = useState<number | null>(null);

  // Queue state
  const [jobs, setJobs] = useState<EcommerceImportJob[]>([]);
  const [jobFilter, setJobFilter] = useState<EcommerceImportJobStatus | 'all'>('all');
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobActionLoading, setJobActionLoading] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Orders state
  const [orders, setOrders] = useState<MeliOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState('');
  const ordersDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const empresaId = activeEmpresaId || '';
  const ecommerceId = meliConn?.id || '';

  // Load connection
  useEffect(() => {
    if (!activeEmpresaId) return;
    listEcommerceConnections()
      .then((conns) => {
        const meli = conns.find((c) => c.provider === 'meli');
        setMeliConn(meli || null);
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
      getMeliAccountInfo(empresaId, ecommerceId).catch(() => null),
      getMeliHealthCheck(empresaId, ecommerceId).catch(() => null),
      getMeliHealthSummary().catch(() => null),
    ]).then(([acc, hlth, summ]) => {
      if (acc?.user) setAccount(acc.user);
      if (hlth) setHealth(hlth);
      if (summ) setSummary(summ);
    }).finally(() => setLoading(false));
  }, [empresaId, ecommerceId]);

  // -------------------------------------------------------------------------
  // Queue tab
  // -------------------------------------------------------------------------
  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const data = await listEcommerceImportJobs({
        provider: 'meli',
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

  // Auto-poll when on queue tab and there are active jobs
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
      await retryEcommerceImportJob(jobId, 'Retry manual via painel');
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
      await enqueueEcommerceImportJob({ provider: 'meli', kind: 'import_orders' });
      addToast('Job de importação de pedidos criado.', 'success');
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
      const data = await listMeliOrders({ q: q || undefined, limit: 100 });
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
  // Tab-specific data (webhooks, questions)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!empresaId || !ecommerceId) return;
    if (tab === 'webhooks') {
      listMeliWebhookEvents(ecommerceId).then(setEvents).catch(() => {});
    }
    if (tab === 'questions') {
      listMeliQuestions(empresaId, ecommerceId)
        .then((r) => setQuestions(r.questions || []))
        .catch(() => {});
    }
  }, [tab, empresaId, ecommerceId]);

  const handleAnswer = async (questionId: number) => {
    const text = answerText[questionId]?.trim();
    if (!text) return;
    setAnswering(questionId);
    try {
      await answerMeliQuestion(empresaId, ecommerceId, questionId, text);
      addToast('Resposta enviada com sucesso!', 'success');
      setAnswerText((prev) => ({ ...prev, [questionId]: '' }));
      const r = await listMeliQuestions(empresaId, ecommerceId);
      setQuestions(r.questions || []);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao enviar resposta.', 'error');
    } finally {
      setAnswering(null);
    }
  };

  if (!meliConn) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Mercado Livre — Painel de Controle</h1>
        <GlassCard className="p-8 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Nenhuma conexão Mercado Livre encontrada.</p>
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
    { key: 'orders', label: 'Pedidos ML', icon: ShoppingCart },
    { key: 'questions', label: 'Perguntas', icon: MessageCircle },
    { key: 'webhooks', label: 'Webhooks', icon: Zap },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mercado Livre — Painel de Controle</h1>
        <div className="flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
            meliConn.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800',
          )}>
            {meliConn.status === 'connected' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {meliConn.status}
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
                ? 'border-blue-500 text-blue-600'
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
          <Loader2 size={32} className="animate-spin text-blue-500" />
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
                  Conta ML
                </div>
                {account ? (
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-gray-900">{account.nickname}</p>
                    <p className="text-xs text-gray-500">{account.email}</p>
                    {account.seller_reputation && (
                      <p className="text-xs text-gray-500">
                        Nível: {account.seller_reputation.level_id}
                        {account.seller_reputation.power_seller_status &&
                          ` — ${account.seller_reputation.power_seller_status}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Não disponível</p>
                )}
              </GlassCard>

              <GlassCard className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Activity size={16} />
                  Saúde
                </div>
                {health ? (
                  <div className="grid grid-cols-2 gap-2">
                    <StatusBadge ok={health.token_ok} label="Token" />
                    <StatusBadge ok={health.account_ok} label="Conta" />
                    <div className="col-span-2 text-xs text-gray-500">
                      Última sync: {health.last_sync_at
                        ? new Date(health.last_sync_at).toLocaleString('pt-BR')
                        : 'Nunca'}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Sem dados</p>
                )}
              </GlassCard>

              <GlassCard className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Package size={16} />
                  Anúncios
                </div>
                {summary ? (
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <KPIMini value={summary.total_anuncios} label="Total" />
                    <KPIMini value={summary.synced} label="Sincronizados" color="text-green-600" />
                    <KPIMini value={summary.pending} label="Pendentes" color="text-amber-600" />
                    <KPIMini value={summary.error} label="Com erro" color="text-red-600" />
                  </div>
                ) : health ? (
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <KPIMini value={health.listings_active} label="Ativos" color="text-green-600" />
                    <KPIMini value={health.listings_paused} label="Pausados" color="text-amber-600" />
                    <KPIMini value={health.listings_error} label="Com erro" color="text-red-600" />
                    <KPIMini value={health.pending_questions} label="Perguntas" color="text-blue-600" />
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
                          ? 'bg-blue-100 text-blue-700'
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
                    <Loader2 size={24} className="animate-spin text-blue-500" />
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
                                    className="p-1 text-blue-500 hover:text-blue-700 disabled:opacity-50"
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
                  className="w-full rounded-xl border border-gray-200/80 bg-white/70 backdrop-blur-sm pl-10 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  placeholder="Buscar por número, cliente ou ID ML..."
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                />
              </div>

              <GlassCard className="overflow-hidden">
                {ordersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-blue-500" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="py-12 text-center">
                    <ShoppingCart size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">
                      {ordersSearch ? 'Nenhum pedido encontrado para essa busca.' : 'Nenhum pedido importado do Mercado Livre.'}
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
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status ML</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ID ML</th>
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
                              <span className="text-xs font-mono bg-yellow-50 text-yellow-700 rounded px-2 py-0.5">
                                {o.ml_status || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-800">
                              R$ {Number(o.total_geral ?? 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <a
                                href={`https://www.mercadolibre.com.br/vendas/${o.external_order_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-mono text-blue-500 hover:text-blue-700"
                              >
                                ML #{o.external_order_id}
                                <ExternalLink size={10} />
                              </a>
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

          {/* ============================================================= */}
          {/* Questions Tab (unchanged)                                      */}
          {/* ============================================================= */}
          {tab === 'questions' && (
            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Perguntas do Mercado Livre</h3>
              {questions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma pergunta encontrada.</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {questions.map((q) => (
                    <div key={q.id} className="rounded-xl border border-gray-200/60 bg-white/60 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {q.from?.nickname || `Usuário ${q.from?.id}`}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(q.date_created).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800">{q.text}</p>
                      {q.answer ? (
                        <div className="rounded-lg bg-blue-50/60 px-3 py-2 text-sm text-blue-800">
                          <span className="font-medium">Resposta:</span> {q.answer.text}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 rounded-lg border border-gray-200/80 bg-white/70 px-3 py-2 text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-100 focus:outline-none"
                            placeholder="Escreva sua resposta..."
                            value={answerText[q.id] || ''}
                            onChange={(e) => setAnswerText((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAnswer(q.id)}
                            disabled={answering === q.id || !answerText[q.id]?.trim()}
                          >
                            {answering === q.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Send size={14} />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {/* ============================================================= */}
          {/* Webhooks Tab (was "logs")                                      */}
          {/* ============================================================= */}
          {tab === 'webhooks' && (
            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Últimos Webhooks Recebidos</h3>
              {events.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhum webhook recebido.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs',
                        ev.process_status === 'done' ? 'border-green-200/60 bg-green-50/30' :
                        ev.process_status === 'error' ? 'border-red-200/60 bg-red-50/30' :
                        'border-gray-200/60 bg-white/40',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-medium">{ev.topic}</span>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          ev.process_status === 'done' ? 'bg-green-100 text-green-800' :
                          ev.process_status === 'error' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-700',
                        )}>
                          {ev.process_status}
                        </span>
                      </div>
                      <p className="text-gray-500 mt-0.5">{ev.resource}</p>
                      <p className="text-gray-400">{new Date(ev.received_at).toLocaleString('pt-BR')}</p>
                      {ev.last_error && <p className="text-red-500 mt-0.5">{ev.last_error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
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
    processing: 'bg-blue-100 text-blue-700',
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
