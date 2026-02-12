import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PauseCircle, PlayCircle, RefreshCw, RotateCcw, Wrench } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { cn } from '@/lib/utils';
import {
  buildWooProductMap,
  forceWooPriceSync,
  forceWooStockSync,
  getWooStoreStatus,
  listWooProductMap,
  pauseWooStore,
  registerWooWebhooks,
  replayWooOrder,
  requeueWooDeadJob,
  runWooHealthcheck,
  runWooWorkerNow,
  type WooProductMapRow,
  type WooStatusResponse,
  unpauseWooStore,
} from '@/services/woocommerceControlPanel';

type PanelSection = 'overview' | 'webhooks' | 'jobs' | 'map' | 'sync' | 'logs';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('pt-BR');
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes('secret') ||
      normalized.includes('token') ||
      normalized.includes('authorization') ||
      normalized.includes('consumer_key') ||
      normalized.includes('consumer_secret') ||
      normalized.includes('password') ||
      normalized === 'ck' ||
      normalized === 'cs'
    ) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = sanitizeValue(inner);
  }
  return out;
}

function statusBadge(status?: string | null) {
  const raw = String(status ?? '').toLowerCase();
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold';
  if (raw === 'active') return <span className={`${base} bg-emerald-100 text-emerald-700`}>Ativa</span>;
  if (raw === 'paused') return <span className={`${base} bg-amber-100 text-amber-800`}>Pausada</span>;
  if (raw === 'error') return <span className={`${base} bg-red-100 text-red-700`}>Erro</span>;
  return <span className={`${base} bg-slate-100 text-slate-700`}>{status || '—'}</span>;
}

function parseSkus(raw: string): string[] {
  return raw
    .split(/\r?\n|,|;/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function WooCommerceStoreDetailPage() {
  const { storeId = '' } = useParams<{ storeId: string }>();
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const [section, setSection] = useState<PanelSection>('overview');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<WooStatusResponse | null>(null);
  const [mapRows, setMapRows] = useState<WooProductMapRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [replayOrderId, setReplayOrderId] = useState('');
  const [syncSkusText, setSyncSkusText] = useState('');

  const storeStatus = status?.store?.status ?? null;
  const isPaused = String(storeStatus ?? '').toLowerCase() === 'paused';

  const loadAll = useCallback(async () => {
    if (!activeEmpresaId || !storeId) {
      setLoading(false);
      setStatus(null);
      setMapRows([]);
      return;
    }
    setLoading(true);
    try {
      const [statusData, mapData] = await Promise.all([
        getWooStoreStatus(activeEmpresaId, storeId),
        listWooProductMap(activeEmpresaId, storeId, 150),
      ]);
      setStatus(statusData);
      setMapRows(mapData);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao carregar painel da loja WooCommerce.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, storeId, addToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const deadOrErrorJobs = useMemo(
    () => (status?.jobs ?? []).filter((job) => job.status === 'dead' || job.status === 'error'),
    [status?.jobs],
  );

  const runAction = useCallback(
    async (key: string, action: () => Promise<unknown>, successMessage: string, shouldReload = true) => {
      if (!activeEmpresaId || !storeId) return;
      setBusyAction(key);
      try {
        await action();
        addToast(successMessage, 'success');
        if (shouldReload) await loadAll();
      } catch (error: any) {
        addToast(error?.message || 'Falha ao executar ação.', 'error');
      } finally {
        setBusyAction(null);
      }
    },
    [activeEmpresaId, storeId, addToast, loadAll],
  );

  const handleReplayOrder = useCallback(async () => {
    const orderId = Number(replayOrderId);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      addToast('Informe um order_id válido para replay.', 'warning');
      return;
    }
    await runAction(
      'replay-order',
      () => replayWooOrder(activeEmpresaId!, storeId, orderId),
      `Replay do pedido #${orderId} enfileirado.`,
    );
  }, [activeEmpresaId, storeId, replayOrderId, runAction, addToast]);

  const handleForceSync = useCallback(
    async (kind: 'stock' | 'price') => {
      const skus = parseSkus(syncSkusText);
      if (!skus.length) {
        addToast('Informe ao menos um SKU para sincronização forçada.', 'warning');
        return;
      }
      if (kind === 'stock') {
        await runAction(
          'sync-stock',
          () => forceWooStockSync(activeEmpresaId!, storeId, skus),
          `${skus.length} SKU(s) enviados para sync de estoque.`,
        );
        return;
      }
      await runAction(
        'sync-price',
        () => forceWooPriceSync(activeEmpresaId!, storeId, skus),
        `${skus.length} SKU(s) enviados para sync de preço.`,
      );
    },
    [activeEmpresaId, storeId, syncSkusText, runAction, addToast],
  );

  const tabButton = (value: PanelSection, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setSection(value)}
      className={cn(
        'rounded-lg border px-3 py-2 text-sm font-medium transition',
        section === value
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="WooCommerce — Painel da Loja"
        description={status?.store?.base_url || 'Diagnóstico e operação por store.'}
        icon={<Wrench className="h-5 w-5" />}
        actions={(
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/app/desenvolvedor/woocommerce">Voltar para lojas</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadAll()} disabled={loading || !!busyAction}>
              <RefreshCw className={`mr-2 h-4 w-4 ${(loading || !!busyAction) ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        )}
      />

      <GlassCard className="flex flex-wrap items-center gap-2 p-3">
        {tabButton('overview', 'Overview')}
        {tabButton('webhooks', 'Webhooks')}
        {tabButton('jobs', 'Jobs / DLQ')}
        {tabButton('map', 'Product Map')}
        {tabButton('sync', 'Sync Tools')}
        {tabButton('logs', 'Logs')}
      </GlassCard>

      {section === 'overview' && (
        <GlassCard className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(storeStatus)}
            <span className="text-sm text-slate-500">Store: {storeId}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Health</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{status?.health?.status_label ?? '—'}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(status?.health?.last_healthcheck_at)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Fila</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Q:{status?.queue?.queued ?? 0} / R:{status?.queue?.running ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate-500">Erro: {status?.queue?.error ?? 0} · Dead: {status?.queue?.dead ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Webhooks</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {status?.webhooks?.received_recent ?? 0} recebidos
              </p>
              <p className="mt-1 text-xs text-slate-500">Falhas recentes: {status?.webhooks?.failed_recent ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Map Quality</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Total: {status?.map_quality?.total ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">
                Missing: {status?.map_quality?.missing_revo_map ?? 0} · Dup SKU: {status?.map_quality?.duplicated_skus ?? 0}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void runAction('healthcheck', () => runWooHealthcheck(activeEmpresaId!, storeId), 'Healthcheck executado.')}
              disabled={!!busyAction}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${busyAction === 'healthcheck' ? 'animate-spin' : ''}`} />
              Testar conexão
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void runAction('register-webhooks', () => registerWooWebhooks(activeEmpresaId!, storeId), 'Webhooks registrados.')}
              disabled={!!busyAction}
            >
              Registrar webhooks
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void runAction('run-worker', () => runWooWorkerNow(activeEmpresaId!, storeId), 'Worker executado.')}
              disabled={!!busyAction}
            >
              <RotateCcw className={`mr-2 h-4 w-4 ${busyAction === 'run-worker' ? 'animate-spin' : ''}`} />
              Run worker now
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void runAction('rebuild-map', () => buildWooProductMap(activeEmpresaId!, storeId), 'Build do product map enfileirado.')}
              disabled={!!busyAction}
            >
              Rebuild map
            </Button>
            {isPaused ? (
              <Button
                type="button"
                onClick={() => void runAction('unpause', () => unpauseWooStore(activeEmpresaId!, storeId), 'Store reativada.')}
                disabled={!!busyAction}
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                Unpause store
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => void runAction('pause', () => pauseWooStore(activeEmpresaId!, storeId), 'Store pausada.')}
                disabled={!!busyAction}
              >
                <PauseCircle className="mr-2 h-4 w-4" />
                Pause store
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-600">Recomendações</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {(status?.recommendations ?? []).length ? (
                status!.recommendations.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)
              ) : (
                <li>Nenhuma recomendação pendente.</li>
              )}
            </ul>
          </div>
        </GlassCard>
      )}

      {section === 'webhooks' && (
        <GlassCard className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Eventos recentes</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Recebido em</th>
                  <th className="px-3 py-2">Topic</th>
                  <th className="px-3 py-2">Order ID</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Erro</th>
                </tr>
              </thead>
              <tbody>
                {(status?.webhook_events ?? []).map((event) => (
                  <tr key={event.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{formatDate(event.received_at)}</td>
                    <td className="px-3 py-2">{event.topic || '—'}</td>
                    <td className="px-3 py-2">{event.woo_resource_id ?? '—'}</td>
                    <td className="px-3 py-2">{event.process_status}</td>
                    <td className="px-3 py-2 text-red-700">{event.error_code || '—'}</td>
                    <td className="px-3 py-2 text-red-600">{event.last_error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {section === 'jobs' && (
        <GlassCard className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Fila e dead-letter</h3>
          <p className="text-xs text-slate-500">Jobs em erro/dead: {deadOrErrorJobs.length}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Criado em</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Tentativas</th>
                  <th className="px-3 py-2">Próximo run</th>
                  <th className="px-3 py-2">Erro</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {(status?.jobs ?? []).map((job) => (
                  <tr key={job.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{formatDate(job.created_at)}</td>
                    <td className="px-3 py-2">{job.type}</td>
                    <td className="px-3 py-2">{job.status}</td>
                    <td className="px-3 py-2">{job.attempts}</td>
                    <td className="px-3 py-2">{formatDate(job.next_run_at)}</td>
                    <td className="px-3 py-2 text-red-600">{job.last_error || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {job.status === 'dead' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void runAction(
                            `requeue-${job.id}`,
                            () => requeueWooDeadJob(activeEmpresaId!, storeId, job.id),
                            `Job ${job.id} reenfileirado.`,
                          )}
                          disabled={!!busyAction}
                        >
                          Reenfileirar
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {section === 'map' && (
        <GlassCard className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Product Map</h3>
          <p className="text-xs text-slate-500">Registros carregados: {mapRows.length}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Produto Revo</th>
                  <th className="px-3 py-2">Woo Product</th>
                  <th className="px-3 py-2">Woo Variation</th>
                  <th className="px-3 py-2">Últ. stock sync</th>
                  <th className="px-3 py-2">Últ. price sync</th>
                </tr>
              </thead>
              <tbody>
                {mapRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.sku || '—'}</td>
                    <td className="px-3 py-2">{row.revo_product_id || '—'}</td>
                    <td className="px-3 py-2">{row.woo_product_id ?? '—'}</td>
                    <td className="px-3 py-2">{row.woo_variation_id ?? '—'}</td>
                    <td className="px-3 py-2">{formatDate(row.last_synced_stock_at)}</td>
                    <td className="px-3 py-2">{formatDate(row.last_synced_price_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {section === 'sync' && (
        <GlassCard className="space-y-4 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Sync tools</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <Input
                name="replay-order-id"
                label="Replay de pedido (order_id)"
                value={replayOrderId}
                onChange={(event) => setReplayOrderId(event.target.value)}
                placeholder="Ex.: 12345"
              />
              <Button type="button" onClick={() => void handleReplayOrder()} disabled={!!busyAction}>
                Replay order_id
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <label className="text-sm font-medium text-slate-700">Force sync por SKU</label>
              <textarea
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="SKU-001, SKU-002 ou um por linha"
                value={syncSkusText}
                onChange={(event) => setSyncSkusText(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void handleForceSync('stock')} disabled={!!busyAction}>
                  Force stock sync
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleForceSync('price')} disabled={!!busyAction}>
                  Force price sync
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {section === 'logs' && (
        <GlassCard className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Logs recentes</h3>
          <div className="space-y-2">
            {(status?.logs ?? []).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold uppercase text-slate-700">{item.level}</span>
                  <span>{formatDate(item.created_at)}</span>
                  {item.job_id && <span>job: {item.job_id}</span>}
                </div>
                <p className="mt-1 text-sm text-slate-900">{item.message}</p>
                {item.meta && (
                  <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-2 text-xs text-slate-200">
                    {JSON.stringify(sanitizeValue(item.meta), null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
