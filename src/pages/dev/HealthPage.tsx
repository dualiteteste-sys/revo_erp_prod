import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getOpsHealthSummary,
  getBusinessKpisFunnelSummary,
  getProductMetricsSummary,
  listOpsRecentFailures,
  dryRunEcommerceDlq,
  dryRunFinanceDlq,
  dryRunNfeioWebhookEvent,
  reprocessEcommerceDlq,
  reprocessFinanceDlq,
  reprocessNfeioWebhookEvent,
  seedEcommerceDlq,
  seedFinanceDlq,
  type DlqReprocessResult,
  type EcommerceDlqRow,
  type FinanceDlqRow,
  type OpsHealthSummary,
  type BusinessKpisFunnelSummary,
  type ProductMetricsSummary,
  type OpsRecentFailure,
} from '@/services/opsHealth';
import { useHasPermission } from '@/hooks/useHasPermission';
import { getEcommerceHealthSummary, type EcommerceHealthSummary } from '@/services/ecommerceIntegrations';

type NfeWebhookRow = {
  id: string;
  received_at: string;
  event_type: string | null;
  nfeio_id: string | null;
  process_attempts: number;
  next_retry_at: string | null;
  locked_at: string | null;
  last_error: string | null;
};

function formatDateTimeBR(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-BR');
}

export default function HealthPage() {
  const { addToast } = useToast();
  const permManage = useHasPermission('ops', 'manage');
  const permEcommerceView = useHasPermission('ecommerce', 'view');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<OpsHealthSummary | null>(null);
  const [productMetrics, setProductMetrics] = useState<ProductMetricsSummary | null>(null);
  const [businessKpis, setBusinessKpis] = useState<BusinessKpisFunnelSummary | null>(null);
  const [ecommerceHealth, setEcommerceHealth] = useState<EcommerceHealthSummary | null>(null);
  const [recent, setRecent] = useState<OpsRecentFailure[]>([]);
  const [nfeRows, setNfeRows] = useState<NfeWebhookRow[]>([]);
  const [financeDlqRows, setFinanceDlqRows] = useState<FinanceDlqRow[]>([]);
  const [ecommerceDlqRows, setEcommerceDlqRows] = useState<EcommerceDlqRow[]>([]);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reprocessingFinanceDlqId, setReprocessingFinanceDlqId] = useState<string | null>(null);
  const [reprocessingEcommerceDlqId, setReprocessingEcommerceDlqId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState<string>('Dry-run');
  const [previewDescription, setPreviewDescription] = useState<string>('');
  const [previewJson, setPreviewJson] = useState<DlqReprocessResult | null>(null);
  const [previewAction, setPreviewAction] = useState<null | { kind: 'finance' | 'ecommerce' | 'nfeio'; id: string }>(null);

  const hasSupabase = !!supabase;
  const isDev = import.meta.env.DEV;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, m, k, r, eh] = await Promise.all([
        getOpsHealthSummary(),
        getProductMetricsSummary().catch(() => null),
        getBusinessKpisFunnelSummary().catch(() => null),
        listOpsRecentFailures({ limit: 30 }),
        permEcommerceView.data ? getEcommerceHealthSummary().catch(() => null) : Promise.resolve(null),
      ]);
      setSummary(s);
      setProductMetrics(m);
      setBusinessKpis(k);
      setRecent(r ?? []);
      setEcommerceHealth(eh);

      if (!hasSupabase) {
        setNfeRows([]);
        setFinanceDlqRows([]);
        setEcommerceDlqRows([]);
        return;
      }

      const [{ data: nfeData, error: nfeError }, { data: finDlqData, error: finDlqError }, { data: ecoDlqData, error: ecoDlqError }] =
        await Promise.all([
          supabase
            .from('fiscal_nfe_webhook_events')
            .select('id,received_at,event_type,nfeio_id,process_attempts,next_retry_at,locked_at,last_error')
            .is('processed_at', null)
            .not('last_error', 'is', null)
            .order('received_at', { ascending: false })
            .limit(30),
          supabase
            .from('finance_job_dead_letters')
            .select('id,dead_lettered_at,job_type,idempotency_key,last_error')
            .order('dead_lettered_at', { ascending: false })
            .limit(30),
          permEcommerceView.data
            ? supabase
                .from('ecommerce_job_dead_letters')
                .select('id,failed_at,provider,kind,dedupe_key,last_error')
                .order('failed_at', { ascending: false })
                .limit(30)
            : Promise.resolve({ data: [], error: null } as any),
        ]);

      if (nfeError) throw nfeError;
      if (finDlqError) throw finDlqError;
      if (ecoDlqError) throw ecoDlqError;

      setNfeRows((nfeData ?? []) as unknown as NfeWebhookRow[]);
      setFinanceDlqRows((finDlqData ?? []) as unknown as FinanceDlqRow[]);
      setEcommerceDlqRows((ecoDlqData ?? []) as unknown as EcommerceDlqRow[]);
    } catch (e: any) {
      const msg = e?.message || 'Falha ao carregar monitor de saúde.';
      addToast(msg, 'error');
      setLoadError(msg);
      setSummary(null);
      setProductMetrics(null);
      setBusinessKpis(null);
      setEcommerceHealth(null);
      setRecent([]);
      setNfeRows([]);
      setFinanceDlqRows([]);
      setEcommerceDlqRows([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, hasSupabase, permEcommerceView.data]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const canReprocess = !!permManage.data;
  const canSeeEcommerce = !!permEcommerceView.data;

  const openPreview = (
    title: string,
    description: string,
    data: DlqReprocessResult,
    action: { kind: 'finance' | 'ecommerce' | 'nfeio'; id: string }
  ) => {
    setPreviewTitle(title);
    setPreviewDescription(description);
    setPreviewJson(data);
    setPreviewAction(action);
    setPreviewOpen(true);
  };

  const handleDryRunNfe = async (id: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    try {
      const res = await dryRunNfeioWebhookEvent(id);
      openPreview('Dry-run: NFE.io', 'Prévia das mudanças (não altera dados).', res, { kind: 'nfeio', id });
    } catch (e: any) {
      addToast(e?.message || 'Falha no dry-run.', 'error');
    }
  };

  const handleReprocess = async (id: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    if (reprocessingId) return;

    setReprocessingId(id);
    try {
      await reprocessNfeioWebhookEvent(id);
      addToast('Evento reenfileirado para reprocessamento.', 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reenfileirar evento.', 'error');
    } finally {
      setReprocessingId(null);
    }
  };

  const handleDryRunFinanceDlq = async (dlqId: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    try {
      const res = await dryRunFinanceDlq(dlqId);
      openPreview('Dry-run: Financeiro (DLQ)', 'Prévia do job que seria reenfileirado (não altera dados).', res, { kind: 'finance', id: dlqId });
    } catch (e: any) {
      addToast(e?.message || 'Falha no dry-run.', 'error');
    }
  };

  const handleReprocessFinanceDlq = async (dlqId: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    if (reprocessingFinanceDlqId) return;

    setReprocessingFinanceDlqId(dlqId);
    try {
      await reprocessFinanceDlq(dlqId);
      addToast('Job reenfileirado a partir da DLQ.', 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reenfileirar job da DLQ.', 'error');
    } finally {
      setReprocessingFinanceDlqId(null);
    }
  };

  const handleDryRunEcommerceDlq = async (dlqId: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    try {
      const res = await dryRunEcommerceDlq(dlqId);
      openPreview('Dry-run: Marketplaces (DLQ)', 'Prévia do job que seria reenfileirado (não altera dados).', res, { kind: 'ecommerce', id: dlqId });
    } catch (e: any) {
      addToast(e?.message || 'Falha no dry-run.', 'error');
    }
  };

  const handleReprocessEcommerceDlq = async (dlqId: string) => {
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    if (reprocessingEcommerceDlqId) return;

    setReprocessingEcommerceDlqId(dlqId);
    try {
      await reprocessEcommerceDlq(dlqId);
      addToast('Job reenfileirado a partir da DLQ.', 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reenfileirar job da DLQ.', 'error');
    } finally {
      setReprocessingEcommerceDlqId(null);
    }
  };

  const handleSeedFinanceDlq = async () => {
    if (!canReprocess) {
      addToast('Sem permissão para criar seed.', 'warning');
      return;
    }
    try {
      const id = await seedFinanceDlq('test');
      addToast(`Seed criado na DLQ (financeiro): ${id}`, 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao criar seed.', 'error');
    }
  };

  const handleSeedEcommerceDlq = async () => {
    if (!canReprocess) {
      addToast('Sem permissão para criar seed.', 'warning');
      return;
    }
    try {
      const id = await seedEcommerceDlq('meli', 'test');
      addToast(`Seed criado na DLQ (marketplaces): ${id}`, 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao criar seed.', 'error');
    }
  };

  const handleExecutePreviewAction = async () => {
    if (!previewAction) return;
    if (!canReprocess) {
      addToast('Sem permissão para reprocessar.', 'warning');
      return;
    }
    try {
      if (previewAction.kind === 'finance') {
        await handleReprocessFinanceDlq(previewAction.id);
      } else if (previewAction.kind === 'ecommerce') {
        await handleReprocessEcommerceDlq(previewAction.id);
      } else {
        await handleReprocess(previewAction.id);
      }
      setPreviewOpen(false);
    } catch {
      // handlers já mostram toast
    }
  };

  const cards = useMemo(() => {
    const s = summary;
    return [
      {
        title: 'Erros do App (24h)',
        value: s?.app_errors ?? 0,
        icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
        hint: 'Erros JS/React capturados pelos handlers globais.',
      },
      {
        title: 'Eventos DB (24h)',
        value: s?.db_events ?? 0,
        icon: <ShieldCheck className="w-5 h-5 text-slate-700" />,
        hint: 'Mudanças em tabelas auditadas (audit_logs).',
      },
      {
        title: 'NFE.io pendentes',
        value: s?.nfeio?.pending ?? 0,
        icon: <Activity className="w-5 h-5 text-blue-600" />,
        hint: 'Webhooks prontos para processamento (next_retry_at <= now).',
      },
      {
        title: 'NFE.io com falha',
        value: s?.nfeio?.failed ?? 0,
        icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
        hint: 'Webhooks sem processed_at e com last_error.',
      },
      {
        title: 'Financeiro pendentes',
        value: s?.finance?.pending ?? 0,
        icon: <Activity className="w-5 h-5 text-emerald-600" />,
        hint: 'Jobs pendentes/processando no financeiro.',
      },
      {
        title: 'Financeiro com falha',
        value: s?.finance?.failed ?? 0,
        icon: <AlertTriangle className="w-5 h-5 text-rose-600" />,
        hint: 'Jobs com status failed (retriáveis).',
      },
    ];
  }, [summary]);

  const metricCards = useMemo(() => {
    const m = productMetrics;
    return [
      {
        title: 'RPC p95 (ms)',
        value: m?.rpc?.p95_ms ?? 0,
        icon: <Activity className="w-5 h-5 text-indigo-600" />,
        hint: 'Latência p95 (eventos metric.rpc).',
      },
      {
        title: 'RPC erro (%)',
        value: m?.rpc?.error_rate_pct ?? 0,
        icon: <AlertTriangle className="w-5 h-5 text-amber-700" />,
        hint: 'Taxa de erro na janela (metric.rpc ok=false).',
      },
      {
        title: 'First value (min ms)',
        value: m?.first_value?.min_ms ?? 0,
        icon: <ShieldCheck className="w-5 h-5 text-slate-700" />,
        hint: 'Tempo mínimo até “primeiro valor” (metric.first_value).',
      },
    ];
  }, [productMetrics]);

  const funnelCards = useMemo(() => {
    const k = businessKpis;
    const ok = !!k?.ok;
    const setupText = ok && k?.setup ? `${k.setup.ok}/${k.setup.total}` : '—';
    const setupHint = ok && k?.setup?.done ? 'Setup concluído.' : 'Complete o mínimo para operar.';
    const saleDays = ok ? k?.first_sale?.days_to_first : null;
    const nfeDays = ok ? k?.first_nfe?.days_to_first : null;
    const payDays = ok ? k?.first_payment?.days_to_first : null;
    return [
      {
        title: 'Setup (onboarding)',
        value: setupText as string | number,
        icon: <ShieldCheck className="w-5 h-5 text-slate-700" />,
        hint: setupHint,
      },
      {
        title: '1ª venda (dias)',
        value: (typeof saleDays === 'number' ? saleDays : '—') as string | number,
        icon: <Activity className="w-5 h-5 text-indigo-600" />,
        hint: ok && k?.first_sale?.at ? `Primeira venda em ${formatDateTimeBR(k.first_sale.at)}.` : 'Ainda não houve venda.',
      },
      {
        title: '1ª NF-e (dias)',
        value: (typeof nfeDays === 'number' ? nfeDays : '—') as string | number,
        icon: <Activity className="w-5 h-5 text-blue-600" />,
        hint: ok && k?.first_nfe?.at ? `Primeira NF-e em ${formatDateTimeBR(k.first_nfe.at)}.` : 'Ainda não houve NF-e emitida.',
      },
      {
        title: '1º recebimento (dias)',
        value: (typeof payDays === 'number' ? payDays : '—') as string | number,
        icon: <Activity className="w-5 h-5 text-emerald-600" />,
        hint: ok && k?.first_payment?.at ? `Primeiro recebimento em ${formatDateTimeBR(k.first_payment.at)}.` : 'Ainda não houve recebimento.',
      },
    ];
  }, [businessKpis]);

  return (
    <div className="p-1 flex flex-col gap-4">
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
            <DialogDescription>{previewDescription}</DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <pre className="text-xs whitespace-pre-wrap break-words text-gray-800">
              {previewJson ? JSON.stringify(previewJson, null, 2) : '—'}
            </pre>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Fechar
            </Button>
            {previewAction ? (
              <Button onClick={handleExecutePreviewAction} className="gap-2">
                <RotateCcw size={16} />
                Reprocessar agora
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <PageHeader
        title="Saúde do sistema"
        description="Falhas recentes, filas, DLQs e sinais de drift operacional."
        icon={<Activity className="w-5 h-5" />}
        actions={
          <Button onClick={fetchAll} variant="outline" className="gap-2" disabled={loading}>
            <RefreshCw size={16} />
            Atualizar
          </Button>
        }
      />

      {!loading && loadError && (
        <GlassCard className="p-4 border border-rose-200 bg-rose-50/60">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-rose-900">Não foi possível carregar o painel</div>
              <div className="text-sm text-rose-800">{loadError}</div>
              <div className="mt-1 text-xs text-rose-700">
                Dica: tente novamente. Se persistir, abra os logs para identificar a falha.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={fetchAll} variant="outline" className="gap-2">
                <RefreshCw size={16} />
                Tentar novamente
              </Button>
              <a
                href="/app/desenvolvedor/logs"
                className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
              >
                Abrir logs
              </a>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map((c) => (
          <GlassCard key={c.title} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {c.icon}
                <div className="text-sm font-medium text-gray-700">{c.title}</div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{c.value}</div>
            </div>
            <div className="mt-2 text-xs text-gray-500">{c.hint}</div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {metricCards.map((c) => (
          <GlassCard key={c.title} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {c.icon}
                <div className="text-sm font-medium text-gray-700">{c.title}</div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{c.value}</div>
            </div>
            <div className="mt-2 text-xs text-gray-500">{c.hint}</div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {funnelCards.map((c) => (
          <GlassCard key={c.title} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {c.icon}
                <div className="text-sm font-medium text-gray-700">{c.title}</div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{c.value}</div>
            </div>
            <div className="mt-2 text-xs text-gray-500">{c.hint}</div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-4">
          <div className="text-sm font-medium text-gray-700">Marketplaces (fila)</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{ecommerceHealth?.pending ?? '—'}</div>
          <div className="mt-1 text-xs text-gray-500">pendentes/processando</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-sm font-medium text-gray-700">Marketplaces (falhas 24h)</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{ecommerceHealth?.failed_24h ?? '—'}</div>
          <div className="mt-1 text-xs text-gray-500">últimas 24h</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-sm font-medium text-gray-700">Marketplaces (último sync)</div>
          <div className="mt-2 text-sm font-semibold text-gray-900">
            {ecommerceHealth?.last_sync_at ? formatDateTimeBR(ecommerceHealth.last_sync_at) : '—'}
          </div>
          <div className="mt-1 text-xs text-gray-500">{canSeeEcommerce ? 'conexões meli/shopee' : 'sem permissão ecommerce:view'}</div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-gray-900">Falhas recentes</div>
            <div className="text-xs text-gray-500">últimas 24h</div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Carregando…</div>
          ) : recent.length === 0 ? (
            <div className="text-sm text-gray-600">Nenhuma falha relevante encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quando</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mensagem</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recent.map((r, idx) => (
                    <tr key={`${r.kind}-${r.occurred_at}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTimeBR(r.occurred_at)}</td>
                      <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{r.kind}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-gray-900">NFE.io — webhooks com falha</div>
            <div className="text-xs text-gray-500">{canReprocess ? 'reprocessamento habilitado' : 'sem permissão para reprocessar'}</div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Carregando…</div>
          ) : nfeRows.length === 0 ? (
            <div className="text-sm text-gray-600">Nenhum webhook em falha.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quando</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Evento</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tent.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Erro</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {nfeRows.map((e) => {
                    const busy = reprocessingId === e.id;
                    return (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTimeBR(e.received_at)}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">
                          <div className="font-medium">{e.event_type || '—'}</div>
                          <div className="text-xs text-gray-500">{e.nfeio_id || '—'}</div>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{e.process_attempts ?? 0}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 max-w-[360px] truncate" title={e.last_error || ''}>
                          {e.last_error || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleDryRunNfe(e.id)}
                              disabled={!canReprocess || busy}
                            >
                              Dry-run
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleReprocess(e.id)}
                              disabled={!canReprocess || busy}
                              title={canReprocess ? 'Reenfileirar agora' : 'Sem permissão'}
                            >
                              <RotateCcw size={14} />
                              Reprocessar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-gray-900">Financeiro — DLQ</div>
            <div className="flex items-center gap-2">
              {isDev && canReprocess ? (
                <Button size="sm" variant="outline" onClick={() => void handleSeedFinanceDlq()}>
                  Seed DLQ
                </Button>
              ) : null}
              <div className="text-xs text-gray-500">{canReprocess ? 'reprocessamento habilitado' : 'sem permissão para reprocessar'}</div>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Carregando…</div>
          ) : financeDlqRows.length === 0 ? (
            <div className="text-sm text-gray-600">Nenhum item na DLQ.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quando</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Erro</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {financeDlqRows.map((row) => {
                    const busy = reprocessingFinanceDlqId === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTimeBR(row.dead_lettered_at)}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{row.job_type}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 max-w-[420px] truncate" title={row.last_error || ''}>
                          {row.last_error || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleDryRunFinanceDlq(row.id)}
                              disabled={!canReprocess || busy}
                            >
                              Dry-run
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleReprocessFinanceDlq(row.id)}
                              disabled={!canReprocess || busy}
                              title={canReprocess ? 'Reenfileirar agora' : 'Sem permissão'}
                            >
                              <RotateCcw size={14} />
                              Reprocessar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-gray-900">Marketplaces — DLQ</div>
            <div className="flex items-center gap-2">
              {isDev && canReprocess && canSeeEcommerce ? (
                <Button size="sm" variant="outline" onClick={() => void handleSeedEcommerceDlq()}>
                  Seed DLQ
                </Button>
              ) : null}
              <div className="text-xs text-gray-500">
                {!canSeeEcommerce ? 'sem permissão ecommerce:view' : canReprocess ? 'reprocessamento habilitado' : 'sem permissão para reprocessar'}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Carregando…</div>
          ) : !canSeeEcommerce ? (
            <div className="text-sm text-gray-600">Sem permissão para visualizar integrações (ecommerce:view).</div>
          ) : ecommerceDlqRows.length === 0 ? (
            <div className="text-sm text-gray-600">Nenhum item na DLQ.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quando</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Erro</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ecommerceDlqRows.map((row) => {
                    const busy = reprocessingEcommerceDlqId === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTimeBR(row.failed_at)}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{row.provider}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{row.kind}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 max-w-[420px] truncate" title={row.last_error || ''}>
                          {row.last_error || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleDryRunEcommerceDlq(row.id)}
                              disabled={!canReprocess || busy}
                            >
                              Dry-run
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleReprocessEcommerceDlq(row.id)}
                              disabled={!canReprocess || busy}
                              title={canReprocess ? 'Reenfileirar agora' : 'Sem permissão'}
                            >
                              <RotateCcw size={14} />
                              Reprocessar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
