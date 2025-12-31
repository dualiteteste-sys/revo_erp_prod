import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { supabase } from '@/lib/supabaseClient';
import { getOpsHealthSummary, listOpsRecentFailures, reprocessNfeioWebhookEvent, type OpsHealthSummary, type OpsRecentFailure } from '@/services/opsHealth';
import { useHasPermission } from '@/hooks/useHasPermission';

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

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<OpsHealthSummary | null>(null);
  const [recent, setRecent] = useState<OpsRecentFailure[]>([]);
  const [nfeRows, setNfeRows] = useState<NfeWebhookRow[]>([]);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const hasSupabase = !!supabase;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([getOpsHealthSummary(), listOpsRecentFailures({ limit: 30 })]);
      setSummary(s);
      setRecent(r ?? []);

      if (!hasSupabase) {
        setNfeRows([]);
        return;
      }

      const { data, error } = await supabase
        .from('fiscal_nfe_webhook_events')
        .select('id,received_at,event_type,nfeio_id,process_attempts,next_retry_at,locked_at,last_error')
        .is('processed_at', null)
        .not('last_error', 'is', null)
        .order('received_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setNfeRows((data ?? []) as unknown as NfeWebhookRow[]);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar monitor de saúde.', 'error');
      setSummary(null);
      setRecent([]);
      setNfeRows([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, hasSupabase]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const canReprocess = !!permManage.data;

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
    ];
  }, [summary]);

  return (
    <div className="p-1 flex flex-col gap-4">
      <PageHeader
        title="Saúde do sistema"
        description="Falhas recentes, integrações e sinais de drift operacional."
        icon={<Activity className="w-5 h-5" />}
        actions={
          <Button onClick={fetchAll} variant="outline" className="gap-2" disabled={loading}>
            <RefreshCw size={16} />
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
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

