import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthProvider';
import { useSubscription } from '../../../contexts/SubscriptionProvider';
import { ExternalLink, FileText, Loader2, Sparkles, AlertTriangle, CheckCircle, RefreshCw, ServerOff, CreditCard, PlusCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '../../../contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Database } from '../../../types/database.types';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import Modal from '@/components/ui/Modal';

type EmpresaAddon = Database['public']['Tables']['empresa_addons']['Row'];
type PlanoMvp = 'ambos' | 'servicos' | 'industria';
type BillingInvoice = {
  id: string;
  status: string | null;
  created: number;
  amount_due: number | null;
  amount_paid: number | null;
  currency: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  number: string | null;
};
type BillingInvoicesResponse = { items?: BillingInvoice[] };
type StripeWebhookEventRow = {
  id: string;
  event_type: string;
  plan_slug: string | null;
  billing_cycle: 'monthly' | 'yearly' | null;
  subscription_status: string | null;
  current_period_end: string | null;
  received_at: string;
  processed_at: string | null;
  last_error: string | null;
};

interface SubscriptionSettingsProps {
  onSwitchToPlans: () => void;
}

type FinopsLimitsStatus = {
  ok: boolean;
  reason?: string;
  month_start?: string;
  month_end?: string;
  users?: { current: number; max: number; remaining: number; at_limit: boolean };
  nfe?: { used: number; max: number; remaining: number; at_limit: boolean };
};

const SubscriptionSkeleton = () => (
  <div className="bg-white/80 rounded-2xl p-6 border border-gray-200 shadow-sm animate-pulse">
    <div className="h-6 bg-gray-200 rounded w-1/3 mb-8"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
        <div className="h-8 bg-gray-300 rounded w-1/2 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
      </div>
      <div>
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
        <div className="h-8 bg-gray-300 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-full"></div>
      </div>
    </div>
    <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
      <div className="h-10 bg-gray-300 rounded-lg w-36"></div>
    </div>
  </div>
);

const EmptyState = ({
  onRefresh,
  onSync,
  syncing,
  canSync,
}: {
  onRefresh: () => void;
  onSync: () => void;
  syncing: boolean;
  canSync: boolean;
}) => (
  <div className="text-center p-10 bg-white/80 rounded-2xl border border-gray-200 shadow-sm">
    <ServerOff className="mx-auto h-12 w-12 text-gray-400" />
    <h3 className="mt-4 text-lg font-medium text-gray-800">Nenhuma assinatura encontrada</h3>
    <p className="mt-1 text-sm text-gray-500">Não foi possível encontrar uma assinatura para esta empresa.</p>
    <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
      <button
        onClick={onRefresh}
        className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 font-semibold py-2 px-4 rounded-lg hover:bg-blue-200 transition-colors"
      >
        <RefreshCw size={16} />
        Atualizar
      </button>
      {canSync ? (
        <button
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {syncing ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
          Sincronizar com Stripe
        </button>
      ) : null}
    </div>
  </div>
);

const getStatusDetails = (status: string) => {
    switch (status) {
      case 'trialing': return { text: 'Em Teste', icon: Sparkles, color: 'blue' };
      case 'active': return { text: 'Ativo', icon: CheckCircle, color: 'green' };
      case 'past_due':
      case 'unpaid': return { text: 'Pagamento Pendente', icon: AlertTriangle, color: 'orange' };
      default: return { text: 'Cancelado', icon: AlertTriangle, color: 'red' };
    }
};

const formatDatePtBr = (d: Date) =>
  d.toLocaleDateString('pt-BR', { year: 'numeric', month: 'short', day: '2-digit' });

const badgeColors: { [key: string]: string } = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
};

const SubscriptionSettings: React.FC<SubscriptionSettingsProps> = ({ onSwitchToPlans }) => {
  const supabase = useSupabase();
  const { session, activeEmpresa } = useAuth();
  const { subscription, loadingSubscription, refetchSubscription } = useSubscription();
  const { addToast } = useToast();
  const empresaFeatures = useEmpresaFeatures();
  const empresaRoleQuery = useEmpresaRole();
  const canAdmin = empresaRoleQuery.isFetched && roleAtLeast(empresaRoleQuery.data, 'admin');
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [addons, setAddons] = useState<EmpresaAddon[]>([]);
  const [loadingAddons, setLoadingAddons] = useState(true);
  const [loadingEntitlements, setLoadingEntitlements] = useState(true);
  const [savingEntitlements, setSavingEntitlements] = useState(false);
  const [planoMvp, setPlanoMvp] = useState<PlanoMvp>('ambos');
  const [maxUsers, setMaxUsers] = useState<number>(999);
  const [maxNfeMonthly, setMaxNfeMonthly] = useState<number>(999);
  const [currentUsersCount, setCurrentUsersCount] = useState<number | null>(null);
  const [pendingUsersCount, setPendingUsersCount] = useState<number | null>(null);
  const [finopsStatus, setFinopsStatus] = useState<FinopsLimitsStatus | null>(null);
  const [loadingFinopsStatus, setLoadingFinopsStatus] = useState(false);
  const [syncingStripe, setSyncingStripe] = useState(false);
  const [isLinkCustomerOpen, setIsLinkCustomerOpen] = useState(false);
  const [stripeCustomerId, setStripeCustomerId] = useState('');
  const [linkingCustomer, setLinkingCustomer] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loadingStripeHistory, setLoadingStripeHistory] = useState(false);
  const [stripeHistory, setStripeHistory] = useState<StripeWebhookEventRow[]>([]);

  const fetchAddons = useCallback(async () => {
    if (!activeEmpresa?.id) return;
    setLoadingAddons(true);
    const { data, error } = await supabase
        .from('empresa_addons')
        .select('*')
        .eq('empresa_id', activeEmpresa.id);
    
    if (error) {
        addToast('Erro ao buscar add-ons.', 'error');
    } else {
        setAddons(data);
    }
    setLoadingAddons(false);
  }, [activeEmpresa, addToast, supabase]);

  const fetchEntitlements = useCallback(async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) return;
    setLoadingEntitlements(true);

    try {
      const { data, error } = await (supabase as any)
        .from('empresa_entitlements')
        .select('plano_mvp, max_users, max_nfe_monthly')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) throw error;

      setPlanoMvp((data?.plano_mvp ?? 'ambos') as PlanoMvp);
      setMaxUsers(typeof data?.max_users === 'number' ? data.max_users : 999);
      setMaxNfeMonthly(typeof data?.max_nfe_monthly === 'number' ? data.max_nfe_monthly : 999);
    } catch (error: any) {
      addToast('Não foi possível carregar o Plano MVP (usando padrão).', 'warning');
      setPlanoMvp('ambos');
      setMaxUsers(999);
      setMaxNfeMonthly(999);
    } finally {
      setLoadingEntitlements(false);
    }
  }, [activeEmpresa?.id, addToast, supabase]);

  const fetchCurrentUsersCount = useCallback(async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) {
      setCurrentUsersCount(null);
      setPendingUsersCount(null);
      return;
    }

    try {
      const { count, error } = await (supabase as any)
        .from('empresa_usuarios')
        .select('user_id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('status', 'ACTIVE');

      if (error) throw error;
      setCurrentUsersCount(typeof count === 'number' ? count : null);

      const { count: pendingCount, error: pendingErr } = await (supabase as any)
        .from('empresa_usuarios')
        .select('user_id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('status', 'PENDING');
      if (pendingErr) throw pendingErr;
      setPendingUsersCount(typeof pendingCount === 'number' ? pendingCount : null);
    } catch {
      setCurrentUsersCount(null);
      setPendingUsersCount(null);
    }
  }, [activeEmpresa?.id, supabase]);

  const fetchFinopsLimitsStatus = useCallback(async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) {
      setFinopsStatus(null);
      return;
    }

    setLoadingFinopsStatus(true);
    try {
      const { data, error } = await (supabase as any).rpc('finops_limits_status');
      if (error) throw error;
      setFinopsStatus((data ?? null) as FinopsLimitsStatus | null);
    } catch {
      setFinopsStatus(null);
    } finally {
      setLoadingFinopsStatus(false);
    }
  }, [activeEmpresa?.id, supabase]);

  useEffect(() => {
    fetchAddons();
    fetchEntitlements();
    fetchCurrentUsersCount();
    fetchFinopsLimitsStatus();
  }, [fetchAddons, fetchEntitlements, fetchCurrentUsersCount, fetchFinopsLimitsStatus]);

  const fetchInvoices = useCallback(async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) return;
    setLoadingInvoices(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-invoices', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { empresa_id: empresaId, limit: 10 },
      });
      if (error) throw error;
      const items = (data as BillingInvoicesResponse | null)?.items ?? [];
      setInvoices(Array.isArray(items) ? items : []);
    } catch {
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  }, [activeEmpresa?.id, session?.access_token, supabase.functions]);

  const fetchStripeHistory = useCallback(async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) return;
    setLoadingStripeHistory(true);
    try {
      const { data, error } = await (supabase as any)
        .from('billing_stripe_webhook_events')
        .select('id,event_type,plan_slug,billing_cycle,subscription_status,current_period_end,received_at,processed_at,last_error')
        .eq('empresa_id', empresaId)
        .order('received_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      setStripeHistory((data || []) as StripeWebhookEventRow[]);
    } catch {
      setStripeHistory([]);
    } finally {
      setLoadingStripeHistory(false);
    }
  }, [activeEmpresa?.id, supabase]);

  useEffect(() => {
    if (subscription) {
      void fetchInvoices();
      void fetchStripeHistory();
    }
  }, [fetchInvoices, fetchStripeHistory, subscription]);

  const handleManageBilling = async () => {
    if (!activeEmpresa) {
      addToast('Nenhuma empresa ativa selecionada.', 'error');
      return;
    }
    setIsPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-portal', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { empresa_id: activeEmpresa.id },
      });

      if (error) throw error;
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "URL do portal de faturamento não recebida.");
      }
    } catch (error: any) {
      addToast(error.message || "Erro ao acessar o portal de faturamento.", "error");
    } finally {
      setIsPortalLoading(false);
    }
  };

  const formatMoney = (amountCents: number | null, currency: string | null) => {
    if (typeof amountCents !== 'number') return '—';
    const cur = (currency || 'brl').toUpperCase();
    const value = amountCents / 100;
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(value);
    } catch {
      return `${cur} ${value.toFixed(2)}`;
    }
  };

  const renderBillingHistory = () => {
    if (!subscription) return null;
    return (
      <div className="bg-white/80 rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Histórico e Faturas</h2>
            <p className="text-sm text-gray-600 mt-1">
              Mudanças de plano e faturas ficam disponíveis no portal. Ao alterar, o Stripe pode calcular proporcional (proration) — confira o preview antes de confirmar.
            </p>
          </div>
          <button
            onClick={handleManageBilling}
            disabled={isPortalLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isPortalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Abrir portal
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-800 flex items-center gap-2">
                <FileText size={16} />
                Últimas faturas
              </div>
              <button
                onClick={() => void fetchInvoices()}
                disabled={loadingInvoices}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingInvoices ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw size={14} />}
                Atualizar
              </button>
            </div>
            {loadingInvoices ? (
              <div className="mt-3 text-sm text-gray-600 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : invoices.length === 0 ? (
              <div className="mt-3 text-sm text-gray-600">Sem faturas encontradas (use o portal).</div>
            ) : (
              <div className="mt-3 space-y-2">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{inv.number || inv.id.slice(0, 10)}</div>
                      <div className="text-xs text-gray-600">
                        {new Date(inv.created * 1000).toLocaleDateString('pt-BR')} • {inv.status || '—'} •{' '}
                        {formatMoney(inv.amount_due ?? inv.amount_paid, inv.currency)}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {inv.hosted_invoice_url ? (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:underline"
                        >
                          Ver <ExternalLink size={14} />
                        </a>
                      ) : null}
                      {inv.invoice_pdf ? (
                        <a
                          href={inv.invoice_pdf}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:underline"
                        >
                          PDF <ExternalLink size={14} />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-800">Eventos Stripe (trilha)</div>
              <button
                onClick={() => void fetchStripeHistory()}
                disabled={loadingStripeHistory}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingStripeHistory ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw size={14} />}
                Atualizar
              </button>
            </div>

            {loadingStripeHistory ? (
              <div className="mt-3 text-sm text-gray-600 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : stripeHistory.length === 0 ? (
              <div className="mt-3 text-sm text-gray-600">Sem eventos registrados ainda.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {stripeHistory.map((e) => (
                  <div key={e.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-sm font-semibold text-gray-800 break-words">{e.event_type}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      {e.plan_slug ? `${e.plan_slug}${e.billing_cycle ? `/${e.billing_cycle}` : ''}` : '—'} •{' '}
                      {e.subscription_status || '—'}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      {new Date(e.received_at).toLocaleString('pt-BR')} {e.processed_at ? '• processado' : '• pendente'}
                    </div>
                    {e.last_error ? <div className="mt-2 text-xs text-red-700">Erro: {e.last_error}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleSyncFromStripe = async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) {
      addToast('Nenhuma empresa ativa selecionada.', 'error');
      return;
    }

    setSyncingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-sync-subscription', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { empresa_id: empresaId },
      });
      if (error) {
        // `supabase.functions.invoke` pode retornar `data: null` em respostas não-2xx,
        // mesmo quando a Edge Function devolve um JSON útil (ex.: { error: "missing_customer" }).
        const raw: any =
          data ??
          ((): any => {
            const ctx: any = (error as any)?.context ?? null;
            const body = ctx?.body ?? null;
            if (!body) return null;
            if (typeof body === 'string') {
              try {
                return JSON.parse(body);
              } catch {
                return null;
              }
            }
            return body;
          })();
        if (raw?.error === 'missing_customer') {
          addToast('Sem cliente Stripe vinculado para esta empresa. Vincule o customer (cus_...) e tente novamente.', 'warning');
          setIsLinkCustomerOpen(true);
          return;
        }
        throw error;
      }
      if (!data?.synced) {
        throw new Error(data?.message || 'Não foi possível sincronizar a assinatura.');
      }
      addToast('Assinatura sincronizada com o Stripe.', 'success');
      refetchSubscription();
    } catch (e: any) {
      addToast(e.message || 'Erro ao sincronizar assinatura com o Stripe.', 'error');
    } finally {
      setSyncingStripe(false);
    }
  };

  const handleLinkCustomer = async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) return;
    const id = stripeCustomerId.trim();
    if (!id.startsWith('cus_')) {
      addToast('Informe um Customer ID válido (cus_...).', 'error');
      return;
    }

    setLinkingCustomer(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-link-customer', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { empresa_id: empresaId, stripe_customer_id: id },
      });
      if (error) throw error;
      if (!data?.linked) throw new Error('Falha ao vincular cliente Stripe.');
      addToast('Cliente Stripe vinculado. Sincronizando assinatura...', 'success');
      setIsLinkCustomerOpen(false);
      setStripeCustomerId('');
      await handleSyncFromStripe();
    } catch (e: any) {
      addToast(e.message || 'Erro ao vincular cliente Stripe.', 'error');
    } finally {
      setLinkingCustomer(false);
    }
  };

  const renderMainSubscription = () => {
    if (loadingSubscription) {
      return <SubscriptionSkeleton />;
    }
    if (!subscription) {
      return (
        <EmptyState
          onRefresh={refetchSubscription}
          onSync={handleSyncFromStripe}
          syncing={syncingStripe}
          canSync={!!activeEmpresa?.id}
        />
      );
    }

    const statusDetails = getStatusDetails(subscription.status);
    const now = new Date();
    const startDate = new Date(subscription.created_at || now);
    const endDate = subscription.current_period_end ? new Date(subscription.current_period_end) : now;
    const totalDuration = Math.max(1, endDate.getTime() - startDate.getTime());
    const elapsedDuration = Math.max(0, now.getTime() - startDate.getTime());
    const progress = Math.min(100, (elapsedDuration / totalDuration) * 100);
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return (
      <div className="bg-white/80 rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Plano Principal</p>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-xl font-bold text-gray-800 capitalize">
                  {subscription.plan?.name || subscription.plan_slug || 'N/A'}
                  <span className="text-base font-normal text-gray-600 ml-2">
                    ({subscription.billing_cycle === 'monthly' ? 'Mensal' : 'Anual'})
                  </span>
                </p>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${badgeColors[statusDetails.color]}`}>
                  {statusDetails.text}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Detalhes do Período</p>
              <p className="text-sm text-gray-700 mt-1">Início em: {formatDatePtBr(startDate)}</p>
              {subscription.status === 'trialing' ? (
                <>
                  <p className="text-sm text-gray-700">Testes terminam em: {formatDatePtBr(endDate)}</p>
                  <p className="text-sm text-gray-700">Cobrança inicia em: {formatDatePtBr(endDate)}</p>
                </>
              ) : (
                <p className="text-sm text-gray-700">
                  {subscription.status === 'active' ? 'Próxima cobrança/renovação:' : 'Período atual encerra em:'}{' '}
                  {formatDatePtBr(endDate)}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex justify-between items-baseline mb-2">
                <p className="text-sm text-gray-500">Tempo Restante</p>
                <p className="text-2xl font-bold text-gray-800">{daysRemaining} <span className="text-base font-normal text-gray-600">dias</span></p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <motion.div className="bg-blue-600 h-2.5 rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1, ease: 'easeOut' }} />
            </div>
            <p className="text-xs text-gray-500 mt-2 text-right">{Math.floor(progress)}% do período utilizado</p>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <button onClick={handleManageBilling} disabled={isPortalLoading} className="w-full md:w-auto flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            {isPortalLoading ? <Loader2 className="animate-spin" size={20}/> : <CreditCard size={20} />}
            <span>Gerenciar Pagamento</span>
          </button>
          <button
            onClick={() => {
              // Para assinaturas existentes: o portal lida com proration e preview de cobrança.
              if (subscription.status === 'active' || subscription.status === 'trialing') {
                void handleManageBilling();
                return;
              }
              onSwitchToPlans();
            }}
            className="w-full md:w-auto bg-blue-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Alterar Plano Principal
          </button>
        </div>
      </div>
    );
  };

  const renderAddons = () => {
    if (loadingAddons) {
        return <div className="h-24 bg-gray-200 rounded-2xl animate-pulse"></div>
    }
    return (
        <div className="bg-white/80 rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Add-ons Ativos</h2>
            {addons.length > 0 ? (
                <div className="space-y-4">
                    {addons.map(addon => {
                        const statusDetails = getStatusDetails(addon.status);
                        return (
                            <div key={addon.addon_slug} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <p className="font-semibold text-gray-800 capitalize">{addon.addon_slug.replace('_', ' ')}</p>
                                    <p className="text-sm text-gray-500">
                                        Renova em: {addon.current_period_end ? new Date(addon.current_period_end).toLocaleDateString('pt-BR') : 'N/A'}
                                    </p>
                                </div>
                                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${badgeColors[statusDetails.color]}`}>
                                    {statusDetails.text}
                                </span>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="text-center py-6">
                    <p className="text-gray-500">Nenhum add-on ativo para esta empresa.</p>
                </div>
            )}
        </div>
    )
  }

  const handleSaveEntitlements = async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) {
      addToast('Nenhuma empresa ativa selecionada.', 'error');
      return;
    }
    if (!canAdmin) {
      addToast('Sem permissão para alterar Plano MVP/Limites. Apenas admin/owner.', 'error');
      return;
    }

    const nextMaxUsers = Number.isFinite(maxUsers) ? Math.max(1, Math.trunc(maxUsers)) : 999;
    const nextMaxNfeMonthly = Number.isFinite(maxNfeMonthly) ? Math.max(0, Math.trunc(maxNfeMonthly)) : 999;

    setSavingEntitlements(true);
    try {
      const { error } = await (supabase as any)
        .from('empresa_entitlements')
        .upsert(
          {
            empresa_id: empresaId,
            plano_mvp: planoMvp,
            max_users: nextMaxUsers,
            max_nfe_monthly: nextMaxNfeMonthly,
          },
          { onConflict: 'empresa_id' }
        );

      if (error) throw error;
      addToast('Plano MVP salvo com sucesso.', 'success');
      await fetchEntitlements();
      await fetchFinopsLimitsStatus();
      window.dispatchEvent(new Event('empresa-features-refresh'));
    } catch (error: any) {
      addToast(error?.message || 'Erro ao salvar Plano MVP.', 'error');
    } finally {
      setSavingEntitlements(false);
    }
  };

  const renderEntitlements = () => {
    const nextServicosEnabled = planoMvp === 'servicos' || planoMvp === 'ambos';
    const nextIndustriaEnabled = planoMvp === 'industria' || planoMvp === 'ambos';
    const normalizedMaxUsers = Number.isFinite(maxUsers) ? Math.max(1, Math.trunc(maxUsers)) : 999;
    const normalizedMaxNfeMonthly = Number.isFinite(maxNfeMonthly) ? Math.max(0, Math.trunc(maxNfeMonthly)) : 999;
    const currentUsers = currentUsersCount ?? 0;
    const pendingUsers = pendingUsersCount ?? 0;
    const reservedUsers = currentUsers + pendingUsers;
    const reservedKnown = currentUsersCount !== null && pendingUsersCount !== null;
    const isOverLimit = reservedKnown && reservedUsers > normalizedMaxUsers;
    const isAtLimit = reservedKnown && reservedUsers >= normalizedMaxUsers;
    const isSyncedFromBilling = !!subscription;
    const canEditEntitlements = canAdmin && !isSyncedFromBilling;
    const nfeUsed = finopsStatus?.ok ? finopsStatus?.nfe?.used ?? null : null;
    const nfeMax = finopsStatus?.ok ? finopsStatus?.nfe?.max ?? null : null;
    const nfeAtLimit = finopsStatus?.ok ? !!finopsStatus?.nfe?.at_limit : false;

    return (
      <div className="bg-white/80 rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Plano MVP e Limites</h2>
          <p className="text-sm text-gray-500 mt-1">
            Quando existe assinatura ativa/trial, estes valores são sincronizados automaticamente a partir do plano contratado (Stripe).
          </p>
          {isSyncedFromBilling ? (
            <p className="mt-2 text-xs text-slate-600">
              Para alterar, use <span className="font-semibold">Alterar Plano Principal</span> acima ou acesse{' '}
              <span className="font-semibold">Gerenciar Pagamento</span>.
            </p>
          ) : null}
          {!canAdmin && !isSyncedFromBilling && (
            <p className="mt-2 text-xs text-amber-700">
              Apenas <span className="font-semibold">admin/owner</span> podem alterar estas configurações.
            </p>
          )}
        </div>
        <button
          onClick={handleSaveEntitlements}
          disabled={savingEntitlements || loadingEntitlements || !canEditEntitlements}
          className="bg-blue-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {savingEntitlements ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Plano MVP</label>
          <select
            value={planoMvp}
            onChange={(e) => setPlanoMvp(e.target.value as PlanoMvp)}
            disabled={loadingEntitlements || !canEditEntitlements}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ambos">Ambos (sem bloqueios)</option>
            <option value="servicos">Serviços (Essencial)</option>
            <option value="industria">Indústria (Essencial)</option>
          </select>
          <p className="text-xs text-gray-500 mt-2">
            Esta configuração afeta menus e rotas (guards) e serve como base para a política de planos/limites.
          </p>

          <div className="mt-4 rounded-lg border border-gray-200 bg-white/60 p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">Módulos habilitados (efeito do plano)</p>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${nextServicosEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                Serviços {nextServicosEnabled ? 'ON' : 'OFF'}
              </span>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${nextIndustriaEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                Indústria {nextIndustriaEnabled ? 'ON' : 'OFF'}
              </span>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${empresaFeatures.nfe_emissao_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                NF-e (emissão) {empresaFeatures.nfe_emissao_enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            {!!empresaFeatures.error && (
              <p className="mt-2 text-[11px] text-amber-700">
                Não foi possível validar o estado atual em <span className="font-semibold">empresa_features</span>. O sistema pode bloquear acesso até normalizar.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Limite de usuários</label>
          <input
            type="number"
            min={1}
            step={1}
            value={Number.isFinite(maxUsers) ? String(maxUsers) : ''}
            onChange={(e) => setMaxUsers(Number(e.target.value))}
            disabled={loadingEntitlements || !canEditEntitlements}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ex.: 3"
          />
          <p className="text-xs text-gray-500 mt-2">
            O banco bloqueia novos vínculos em <span className="font-semibold">empresa_usuarios</span> quando o limite é atingido.
          </p>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-white/60 px-3 py-2">
            <div className="text-xs text-gray-700">
              Usuários ativos: <span className="font-semibold">{currentUsersCount === null ? '—' : currentUsers}</span>
              {pendingUsersCount !== null ? (
                <span className="text-gray-500">
                  {' '}
                  • convites pendentes: <span className="font-semibold">{pendingUsers}</span>
                </span>
              ) : null}
            </div>
            <div className={`text-xs font-semibold ${isOverLimit ? 'text-red-700' : isAtLimit ? 'text-amber-700' : 'text-gray-600'}`}>
              {currentUsersCount === null ? 'Sem leitura' : `${reservedUsers} / ${normalizedMaxUsers}`}
            </div>
          </div>
          {isOverLimit && (
            <p className="mt-2 text-xs text-red-700">
              A empresa está acima do limite configurado. Ajuste o limite ou remova vínculos em <span className="font-semibold">Usuários</span>.
            </p>
          )}

          <div className="mt-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Limite de NF-e por mês</label>
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(maxNfeMonthly) ? String(maxNfeMonthly) : ''}
              onChange={(e) => setMaxNfeMonthly(Number(e.target.value))}
              disabled={loadingEntitlements || !canEditEntitlements}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex.: 150"
            />
            <p className="text-xs text-gray-500 mt-2">
              O banco bloqueia a emissão quando a NF sai de <span className="font-semibold">rascunho</span> e o limite mensal já foi atingido.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-white/60 px-3 py-2">
              <div className="text-xs text-gray-700">
                Consumo no mês: <span className="font-semibold">{loadingFinopsStatus ? '…' : (nfeUsed ?? '—')}</span>
              </div>
              <div className={`text-xs font-semibold ${nfeAtLimit ? 'text-amber-700' : 'text-gray-600'}`}>
                {loadingFinopsStatus ? '…' : (nfeUsed !== null && nfeMax !== null ? `${nfeUsed} / ${nfeMax}` : `— / ${normalizedMaxNfeMonthly}`)}
              </div>
            </div>
            {finopsStatus && finopsStatus.ok === false ? (
              <p className="mt-2 text-xs text-amber-700">
                Não foi possível obter o status de limites ({finopsStatus.reason ?? 'erro'}). Ainda assim, o enforcement ocorre no banco.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Minha Assinatura</h1>
        <button
          onClick={() => {
            if (canAdmin) {
              void handleSyncFromStripe();
              return;
            }
            refetchSubscription();
            fetchAddons();
          }}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors px-3 py-1 rounded-md hover:bg-blue-50"
          aria-label="Atualizar dados da assinatura"
        >
          {syncingStripe ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          <span>{canAdmin ? 'Sincronizar' : 'Atualizar'}</span>
        </button>
      </div>
      {renderMainSubscription()}
      {renderAddons()}
      {renderBillingHistory()}
      {renderEntitlements()}

      <Modal
        isOpen={isLinkCustomerOpen}
        onClose={() => setIsLinkCustomerOpen(false)}
        title="Vincular Cliente Stripe (cus_...)"
        size="lg"
        bodyClassName="p-6 md:p-8"
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            Use isso apenas se você já tem uma assinatura no Stripe, mas esta empresa ainda não está vinculada ao Customer.
          </div>
          <div>
            <label className="text-sm text-gray-700">Customer ID</label>
            <input
              value={stripeCustomerId}
              onChange={(e) => setStripeCustomerId(e.target.value)}
              placeholder="cus_..."
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsLinkCustomerOpen(false)}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
              disabled={linkingCustomer}
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleLinkCustomer()}
              disabled={linkingCustomer}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {linkingCustomer ? 'Vinculando…' : 'Vincular e sincronizar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SubscriptionSettings;
