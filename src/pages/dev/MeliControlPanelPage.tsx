import { useState, useEffect } from 'react';
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
  type MeliWebhookEvent,
  type MeliHealthSummary,
} from '@/services/meliCategories';
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
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'queue' | 'logs' | 'questions';

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

  // Load data when connection is available
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

  // Load tab-specific data
  useEffect(() => {
    if (!empresaId || !ecommerceId) return;
    if (tab === 'logs') {
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
      // Refresh questions
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
    { key: 'queue', label: 'Fila de Sync', icon: RefreshCw },
    { key: 'logs', label: 'Webhooks', icon: Zap },
    { key: 'questions', label: 'Perguntas', icon: MessageCircle },
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

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {tab === 'overview' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Account card */}
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

              {/* Health card */}
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

              {/* KPIs card */}
              <GlassCard className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Package size={16} />
                  Anúncios
                </div>
                {summary ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <KPIMini value={summary.total_anuncios} label="Total" />
                      <KPIMini value={summary.synced} label="Sincronizados" color="text-green-600" />
                      <KPIMini value={summary.pending} label="Pendentes" color="text-amber-600" />
                      <KPIMini value={summary.error} label="Com erro" color="text-red-600" />
                    </div>
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

          {/* Queue Tab */}
          {tab === 'queue' && (
            <GlassCard className="p-5">
              <p className="text-sm text-gray-500">
                A fila de sincronização é processada automaticamente pelo <span className="font-mono text-xs">meli-worker</span>.
                Jobs são criados pelo scheduler ou por ações manuais.
              </p>
              <div className="mt-4 text-center py-8 text-gray-400">
                <Clock size={32} className="mx-auto mb-2" />
                <p className="text-sm">Consulte os logs de sync em Desenvolvedor &gt; Logs para detalhes.</p>
              </div>
            </GlassCard>
          )}

          {/* Logs/Webhooks Tab */}
          {tab === 'logs' && (
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

          {/* Questions Tab */}
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
