import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plug, RefreshCw, Settings as SettingsIcon, Unlink, Link2, AlertTriangle } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { useHasPermission } from '@/hooks/useHasPermission';
import { supabase } from '@/lib/supabaseClient';
import {
  type EcommerceConnection,
  type EcommerceConnectionDiagnostics,
  disconnectEcommerceConnection,
  getEcommerceConnectionDiagnostics,
  getEcommerceHealthSummary,
  listEcommerceConnections,
  normalizeEcommerceConfig,
  resolveWooConnectionStatus,
  setWooConnectionSecrets,
  upsertEcommerceConnection,
  updateEcommerceConnectionConfig,
  type EcommerceHealthSummary,
} from '@/services/ecommerceIntegrations';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { listEcommerceProductMappings, upsertEcommerceProductMapping, type EcommerceProductMappingRow } from '@/services/ecommerceCatalog';
import {
  cancelEcommerceImportJob,
  enqueueEcommerceImportJob,
  getEcommerceImportJob,
  listEcommerceImportJobs,
  retryEcommerceImportJob,
  type EcommerceImportJob,
  type EcommerceImportJobDetail,
  type EcommerceImportJobStatus,
} from '@/services/ecommerceImportJobs';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import RoadmapButton from '@/components/roadmap/RoadmapButton';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { listDepositos } from '@/services/suprimentos';
import { listTabelasPreco } from '@/services/pricing';

type Provider = 'meli' | 'shopee' | 'woo';
type CatalogProvider = Exclude<Provider, 'woo'>;
type JobStatusFilter = EcommerceImportJobStatus | 'all';
const WOO_CREDENTIAL_MASK = '••••••••••••••••';
const JOBS_PAGE_SIZE = 8;

const providerLabels: Record<Provider, string> = {
  meli: 'Mercado Livre',
  shopee: 'Shopee',
  woo: 'WooCommerce',
};

function statusBadge(status?: string | null) {
  const s = (status || 'disconnected').toLowerCase();
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
  if (s === 'connected') return <span className={`${base} bg-emerald-100 text-emerald-800`}>Conectado</span>;
  if (s === 'pending') return <span className={`${base} bg-amber-100 text-amber-800`}>Pendente</span>;
  if (s === 'error') return <span className={`${base} bg-red-100 text-red-800`}>Erro</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>Desconectado</span>;
}

function defaultConfig() {
  return {
    import_orders: true,
    sync_stock: false,
    push_tracking: false,
    safe_mode: true,
  };
}

function jobStatusBadge(status: EcommerceImportJobStatus) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
  if (status === 'done') return <span className={`${base} bg-emerald-100 text-emerald-800`}>Concluído</span>;
  if (status === 'processing') return <span className={`${base} bg-sky-100 text-sky-800`}>Processando</span>;
  if (status === 'pending') return <span className={`${base} bg-amber-100 text-amber-800`}>Na fila</span>;
  if (status === 'error' || status === 'dead') return <span className={`${base} bg-red-100 text-red-800`}>Falha</span>;
  if (status === 'canceled') return <span className={`${base} bg-gray-100 text-gray-700`}>Cancelado</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>{status}</span>;
}

function jobStatusFilterOptions() {
  return [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Na fila' },
    { value: 'processing', label: 'Processando' },
    { value: 'done', label: 'Concluído' },
    { value: 'error', label: 'Falha' },
    { value: 'dead', label: 'Dead letter' },
    { value: 'canceled', label: 'Cancelado' },
  ] as const;
}

function wooPendingReason(
  conn: EcommerceConnection | null,
  wooDiag: EcommerceConnectionDiagnostics | null,
  wooDiagUnavailable: boolean,
) {
  if (!conn) return null;
  const storeUrl = String(conn.config?.store_url ?? '').trim();
  if (!storeUrl) return 'Falta URL da loja';
  if (wooDiagUnavailable) return 'Não foi possível validar credenciais agora (diagnóstico indisponível)';
  if (!wooDiag?.has_token) return 'Faltam credenciais (Consumer Key/Secret)';
  return null;
}

export default function MarketplaceIntegrationsPage() {
  const { addToast } = useToast();
  const permView = useHasPermission('ecommerce', 'view');
  const permManage = useHasPermission('ecommerce', 'manage');

  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<EcommerceConnection[]>([]);
  const [health, setHealth] = useState<EcommerceHealthSummary | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [activeConnection, setActiveConnection] = useState<EcommerceConnection | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, any> | null>(null);
  const [queueingImportProvider, setQueueingImportProvider] = useState<Provider | null>(null);
  const [jobsByProvider, setJobsByProvider] = useState<Record<Provider, EcommerceImportJob[]>>({
    meli: [],
    shopee: [],
    woo: [],
  });
  const [jobsHasMoreByProvider, setJobsHasMoreByProvider] = useState<Record<Provider, boolean>>({
    meli: false,
    shopee: false,
    woo: false,
  });
  const [jobsOffsetByProvider, setJobsOffsetByProvider] = useState<Record<Provider, number>>({
    meli: 0,
    shopee: 0,
    woo: 0,
  });
  const [jobsStatusFilterByProvider, setJobsStatusFilterByProvider] = useState<Record<Provider, JobStatusFilter>>({
    meli: 'all',
    shopee: 'all',
    woo: 'all',
  });
  const [jobsLoadingProvider, setJobsLoadingProvider] = useState<Provider | null>(null);
  const [jobsActionId, setJobsActionId] = useState<string | null>(null);
  const [jobsDetailOpen, setJobsDetailOpen] = useState(false);
  const [jobsDetailLoading, setJobsDetailLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobDetail, setSelectedJobDetail] = useState<EcommerceImportJobDetail | null>(null);
  const [selectedJobProvider, setSelectedJobProvider] = useState<Provider | null>(null);
  const [mappingsOpen, setMappingsOpen] = useState(false);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [mappingsProvider, setMappingsProvider] = useState<CatalogProvider>('meli');
  const [mappingsQuery, setMappingsQuery] = useState('');
  const [mappings, setMappings] = useState<EcommerceProductMappingRow[]>([]);
  const [savingMapId, setSavingMapId] = useState<string | null>(null);
  const [mappingsSort, setMappingsSort] = useState<SortState<'produto' | 'sku' | 'anuncio'>>({ column: 'produto', direction: 'asc' });
  const [wooConsumerKey, setWooConsumerKey] = useState('');
  const [wooConsumerSecret, setWooConsumerSecret] = useState('');
  const [wooSavingSecrets, setWooSavingSecrets] = useState(false);
  const [wooDepositos, setWooDepositos] = useState<Array<{ id: string; nome: string }>>([]);
  const [wooTabelasPreco, setWooTabelasPreco] = useState<Array<{ id: string; nome: string }>>([]);
  const [wooOptionsLoading, setWooOptionsLoading] = useState(false);
  const [wooDiag, setWooDiag] = useState<EcommerceConnectionDiagnostics | null>(null);
  const [wooDiagUnavailable, setWooDiagUnavailable] = useState(false);
  const [wooEditingConsumerKey, setWooEditingConsumerKey] = useState(false);
  const [wooEditingConsumerSecret, setWooEditingConsumerSecret] = useState(false);
  const jobsPollHasActiveRef = useRef(false);

  const mappingsColumns: TableColumnWidthDef[] = [
    { id: 'produto', defaultWidth: 320, minWidth: 220 },
    { id: 'sku', defaultWidth: 160, minWidth: 120 },
    { id: 'anuncio', defaultWidth: 360, minWidth: 220 },
    { id: 'acoes', defaultWidth: 140, minWidth: 120, resizable: false },
  ];
  const { widths: mappingsWidths, startResize: startMappingsResize } = useTableColumnWidths({
    tableId: 'settings:ecommerce:mappings',
    columns: mappingsColumns,
  });

  const mappingsSorted = useMemo(() => {
    return sortRows(
      mappings,
      mappingsSort as any,
      [
        { id: 'produto', type: 'string', getValue: (r: EcommerceProductMappingRow) => r.produto_nome ?? '' },
        { id: 'sku', type: 'string', getValue: (r: EcommerceProductMappingRow) => r.produto_sku ?? '' },
        { id: 'anuncio', type: 'string', getValue: (r: EcommerceProductMappingRow) => r.anuncio_identificador ?? '' },
      ] as const
    );
  }, [mappings, mappingsSort]);

  const canView = !!permView.data;
  const canManage = !!permManage.data;

  const refreshWooDiag = useCallback(async () => {
    if (!canView) return null;
    try {
      const diag = await getEcommerceConnectionDiagnostics('woo');
      setWooDiag(diag);
      setWooDiagUnavailable(false);
      return diag;
    } catch {
      setWooDiag(null);
      setWooDiagUnavailable(true);
      return null;
    }
  }, [canView]);

  const loadProviderJobs = useCallback(
    async (
      provider: Provider,
      options?: {
        append?: boolean;
        offset?: number;
        status?: JobStatusFilter;
      },
    ): Promise<EcommerceImportJob[]> => {
      if (!canView) return [];
      const append = options?.append === true;
      const offset = options?.offset ?? (append ? jobsOffsetByProvider[provider] : 0);
      const status = options?.status ?? jobsStatusFilterByProvider[provider];
      setJobsLoadingProvider(provider);
      try {
        const jobs = await listEcommerceImportJobs({
          provider,
          kind: 'import_orders',
          status: status === 'all' ? null : status,
          limit: JOBS_PAGE_SIZE,
          offset,
        });
        setJobsByProvider((prev) => ({
          ...prev,
          [provider]: append ? [...prev[provider], ...jobs] : jobs,
        }));
        setJobsHasMoreByProvider((prev) => ({
          ...prev,
          [provider]: jobs.length === JOBS_PAGE_SIZE,
        }));
        setJobsOffsetByProvider((prev) => ({
          ...prev,
          [provider]: append ? offset + jobs.length : jobs.length,
        }));
        return jobs;
      } catch {
        if (!append) {
          setJobsByProvider((prev) => ({ ...prev, [provider]: [] }));
          setJobsHasMoreByProvider((prev) => ({ ...prev, [provider]: false }));
          setJobsOffsetByProvider((prev) => ({ ...prev, [provider]: 0 }));
        }
        return [];
      } finally {
        setJobsLoadingProvider((prev) => (prev === provider ? null : prev));
      }
    },
    [canView, jobsOffsetByProvider, jobsStatusFilterByProvider],
  );

  const loadAllProviderJobs = useCallback(async () => {
    if (!canView) return;
    const providers: Provider[] = ['meli', 'shopee', 'woo'];
    const all = await Promise.all(providers.map(async (provider) => loadProviderJobs(provider, { append: false, offset: 0 })));
    jobsPollHasActiveRef.current = all.flat().some((job) => job.status === 'pending' || job.status === 'processing');
  }, [canView, loadProviderJobs]);

  const fetchAll = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [c, h] = await Promise.all([listEcommerceConnections(), getEcommerceHealthSummary()]);
      setConnections(c);
      setHealth(h);
      void refreshWooDiag();
      void loadAllProviderJobs();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar integrações.', 'error');
      setConnections([]);
      setHealth(null);
      setWooDiag(null);
      setWooDiagUnavailable(false);
      setJobsByProvider({ meli: [], shopee: [], woo: [] });
      setJobsHasMoreByProvider({ meli: false, shopee: false, woo: false });
      setJobsOffsetByProvider({ meli: 0, shopee: 0, woo: 0 });
    } finally {
      setLoading(false);
    }
  }, [addToast, canView, loadAllProviderJobs, refreshWooDiag]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 8000;

    const schedule = () => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        await loadAllProviderJobs();
        const hasActiveJobs = jobsPollHasActiveRef.current;
        if (hasActiveJobs) {
          delay = Math.min(delay * 2, 30000);
        } else {
          delay = 30000;
        }
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canView, loadAllProviderJobs]);

  useEffect(() => {
    if (!configOpen || !activeConnection) return;
    if (activeConnection.provider !== 'woo') return;

    let cancelled = false;
    setWooOptionsLoading(true);
    void Promise.all([listDepositos({ onlyActive: true }), listTabelasPreco({ q: null })])
      .then(([deps, tabs]) => {
        if (cancelled) return;
        setWooDepositos(deps.map((d) => ({ id: d.id, nome: d.nome })));
        setWooTabelasPreco(tabs.map((t) => ({ id: t.id, nome: t.nome })));
      })
      .catch((e: any) => {
        if (cancelled) return;
        addToast(e?.message || 'Falha ao carregar depósitos/tabelas de preço.', 'error');
        setWooDepositos([]);
        setWooTabelasPreco([]);
      })
      .finally(() => {
        if (cancelled) return;
        setWooOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeConnection, addToast, configOpen]);

  const byProvider = useMemo(() => {
    const map = new Map<string, EcommerceConnection>();
    for (const c of connections) map.set(c.provider, c);
    return map;
  }, [connections]);

  const handleConnect = async (provider: Provider) => {
    if (!canManage) {
      addToast('Sem permissão para gerenciar integrações.', 'warning');
      return;
    }
    if (busyProvider) return;

    setBusyProvider(provider);
    try {
      const created = await upsertEcommerceConnection({
        provider,
        nome: providerLabels[provider],
        status: 'pending',
        config: defaultConfig(),
      });
      addToast('Integração criada. Configure as credenciais do canal e use “Testar conexão”.', 'success');
      await fetchAll();
      setActiveConnection(created);
      setDiagnostics(null);
      setConfigOpen(true);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao iniciar conexão.', 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const handleDisconnect = async (provider: Provider) => {
    if (!canManage) {
      addToast('Sem permissão para gerenciar integrações.', 'warning');
      return;
    }
    const conn = byProvider.get(provider);
    if (!conn) return;
    if (busyProvider) return;

    setBusyProvider(provider);
    try {
      await disconnectEcommerceConnection(conn.id);
      addToast('Integração desconectada.', 'success');
      if (activeConnection?.id === conn.id) {
        setConfigOpen(false);
        setActiveConnection(null);
        setDiagnostics(null);
      }
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao desconectar.', 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const openConfig = (provider: Provider) => {
    const conn = byProvider.get(provider);
    if (!conn) return;
    setActiveConnection(conn);
    setDiagnostics(null);
    setWooConsumerKey('');
    setWooConsumerSecret('');
    setWooEditingConsumerKey(false);
    setWooEditingConsumerSecret(false);
    setConfigOpen(true);
    if (provider === 'woo') void refreshWooDiag();
  };

  const handleTestConnection = async () => {
    if (!activeConnection) return;
    const provider = activeConnection.provider as Provider;
    if (testingProvider) return;

    setTestingProvider(provider);
    try {
      if (provider === 'woo') {
        const storeUrl = String(activeConnection.config?.store_url ?? '').trim();
        if (!storeUrl) {
          addToast('Informe a URL da loja antes de testar.', 'warning');
          return;
        }
        if (!wooConsumerKey.trim() || !wooConsumerSecret.trim()) {
          addToast('Informe o Consumer Key/Secret para testar a conexão.', 'warning');
          return;
        }

        const { data, error } = await supabase.functions.invoke('woocommerce-test-connection', {
          body: { store_url: storeUrl, consumer_key: wooConsumerKey.trim(), consumer_secret: wooConsumerSecret.trim() },
        });
        if (error) throw error;
        const ok = (data as any)?.ok === true;
        setDiagnostics((data as any) ?? null);
        addToast(ok ? 'Conexão WooCommerce OK.' : 'Conexão WooCommerce falhou. Veja os detalhes.', ok ? 'success' : 'error');
        return;
      }

      const diag = await getEcommerceConnectionDiagnostics(provider);
      setDiagnostics(diag as any);
      if (diag.status === 'connected' && diag.has_token && !diag.token_expired) {
        addToast('Conexão OK.', 'success');
      } else {
        addToast('Conexão ainda incompleta. Veja os detalhes no assistente.', 'warning');
      }
    } catch (e: any) {
      addToast(e?.message || 'Falha ao testar conexão.', 'error');
      setDiagnostics(null);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleAuthorize = async () => {
    if (!activeConnection) return;
    const provider = activeConnection.provider as Provider;
    if (provider === 'woo') {
      addToast('WooCommerce não usa OAuth. Informe a URL e as chaves e use “Salvar credenciais”.', 'info');
      return;
    }
    if (!supabase) {
      addToast('Supabase client indisponível.', 'error');
      return;
    }
    if (!canManage) {
      addToast('Sem permissão para gerenciar integrações.', 'warning');
      return;
    }
    if (testingProvider) return;

    setTestingProvider(provider);
    try {
      const redirect_to = `${window.location.origin}/app/configuracoes/ecommerce/marketplaces`;
      const { data, error } = await supabase.functions.invoke('marketplaces-oauth', {
        body: { action: 'start', provider, redirect_to },
      });
      if (error) throw error;
      const url = (data as any)?.url as string | undefined;
      if (!url) throw new Error('URL de autorização não retornada.');
      window.location.assign(url);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao iniciar OAuth.', 'error');
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveConfig = async () => {
    if (!activeConnection) return;
    if (!canManage) {
      addToast('Sem permissão para gerenciar integrações.', 'warning');
      return;
    }
    if (savingConfig) return;

    setSavingConfig(true);
    try {
      await updateEcommerceConnectionConfig(activeConnection.id, activeConnection.config ?? {});
      if (activeConnection.provider === 'woo') {
        const storeUrl = String(activeConnection.config?.store_url ?? '').trim();
        const diag = await refreshWooDiag();
        const hasSecrets = diag?.has_token === true;
        const diagUnavailableNow = diag == null;
        const reason = wooPendingReason(
          { ...activeConnection, config: activeConnection.config ?? null },
          diag ?? null,
          diagUnavailableNow,
        );

        const nextStatus = resolveWooConnectionStatus({
          storeUrl,
          hasSecrets,
          diagnosticsUnavailable: diagUnavailableNow,
          previousStatus: activeConnection.status ?? null,
        });
        await upsertEcommerceConnection({
          provider: 'woo',
          nome: providerLabels.woo,
          status: nextStatus,
          external_account_id: activeConnection.external_account_id ?? null,
          config: normalizeEcommerceConfig(activeConnection.config ?? {}),
        });

        if (nextStatus === 'connected') {
          addToast(
            diagUnavailableNow
              ? 'Configuração salva. Conectividade mantida, mas o diagnóstico de credenciais está temporariamente indisponível.'
              : 'Integração conectada.',
            diagUnavailableNow ? 'warning' : 'success',
          );
        } else {
          addToast(`Integração salva, mas ainda pendente. ${reason ? `Motivo: ${reason}.` : ''}`.trim(), 'warning');
        }
      } else {
        addToast('Configurações salvas.', 'success');
      }
      setConfigOpen(false);
      setActiveConnection(null);
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar configurações.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveWooSecrets = async () => {
    if (!activeConnection || activeConnection.provider !== 'woo') return;
    if (!canManage) {
      addToast('Sem permissão para gerenciar integrações.', 'warning');
      return;
    }
    if (wooSavingSecrets) return;

    const consumerKey = wooConsumerKey.trim();
    const consumerSecret = wooConsumerSecret.trim();
    if (!consumerKey || !consumerSecret) {
      addToast('Informe o Consumer Key e Consumer Secret.', 'warning');
      return;
    }

    setWooSavingSecrets(true);
    try {
      await setWooConnectionSecrets({ ecommerceId: activeConnection.id, consumerKey, consumerSecret });
      setWooConsumerKey('');
      setWooConsumerSecret('');
      setWooEditingConsumerKey(false);
      setWooEditingConsumerSecret(false);
      const diag = await refreshWooDiag();
      const storeUrl = String(activeConnection.config?.store_url ?? '').trim();
      const diagUnavailableNow = diag == null;
      const nextStatus = resolveWooConnectionStatus({
        storeUrl,
        hasSecrets: true,
        diagnosticsUnavailable: diagUnavailableNow,
        previousStatus: activeConnection.status ?? null,
      });

      await upsertEcommerceConnection({
        provider: 'woo',
        nome: providerLabels.woo,
        status: nextStatus,
        external_account_id: activeConnection.external_account_id ?? null,
        config: normalizeEcommerceConfig(activeConnection.config ?? {}),
      });

      setActiveConnection((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      if (nextStatus === 'connected') {
        addToast('Credenciais salvas e integração conectada.', 'success');
      } else {
        const reason = wooPendingReason(
          { ...activeConnection, config: activeConnection.config ?? null },
          diag ?? null,
          diagUnavailableNow,
        );
        addToast(`Credenciais salvas, mas a integração segue pendente. ${reason ? `Motivo: ${reason}.` : ''}`.trim(), 'warning');
      }
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar credenciais.', 'error');
    } finally {
      setWooSavingSecrets(false);
    }
  };

  const loadMappings = useCallback(
    async (provider: CatalogProvider, q?: string) => {
      setMappingsLoading(true);
      try {
        const rows = await listEcommerceProductMappings({ provider, q: q ?? '', limit: 50, offset: 0 });
        setMappings(rows);
      } catch (e: any) {
        addToast(e?.message || 'Falha ao carregar mapeamentos.', 'error');
        setMappings([]);
      } finally {
        setMappingsLoading(false);
      }
    },
    [addToast],
  );

  const openMappings = async (provider: CatalogProvider) => {
    if (!canManage) {
      addToast('Sem permissão para gerenciar integrações.', 'warning');
      return;
    }
    setMappingsProvider(provider);
    setMappingsQuery('');
    setMappingsOpen(true);
    await loadMappings(provider, '');
  };

  const handleSaveMapping = async (row: EcommerceProductMappingRow, identificador: string) => {
    if (!canManage) {
      addToast('Sem permissão para gerenciar integrações.', 'warning');
      return;
    }
    if (savingMapId) return;
    setSavingMapId(row.produto_id);
    try {
      await upsertEcommerceProductMapping({ provider: mappingsProvider, produto_id: row.produto_id, identificador });
      addToast('Mapeamento salvo.', 'success');
      await loadMappings(mappingsProvider, mappingsQuery);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar mapeamento.', 'error');
    } finally {
      setSavingMapId(null);
    }
  };

  const handleChangeJobsFilter = async (provider: Provider, status: JobStatusFilter) => {
    setJobsStatusFilterByProvider((prev) => ({ ...prev, [provider]: status }));
    setJobsOffsetByProvider((prev) => ({ ...prev, [provider]: 0 }));
    await loadProviderJobs(provider, { append: false, offset: 0, status });
  };

  const handleLoadMoreJobs = async (provider: Provider) => {
    if (jobsLoadingProvider || !jobsHasMoreByProvider[provider]) return;
    await loadProviderJobs(provider, {
      append: true,
      offset: jobsOffsetByProvider[provider],
      status: jobsStatusFilterByProvider[provider],
    });
  };

  const handleOpenJobDetail = async (provider: Provider, jobId: string) => {
    setSelectedJobId(jobId);
    setSelectedJobProvider(provider);
    setSelectedJobDetail(null);
    setJobsDetailOpen(true);
    setJobsDetailLoading(true);
    try {
      const detail = await getEcommerceImportJob(jobId, { runsLimit: 30, itemsLimit: 300 });
      setSelectedJobDetail(detail);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar detalhes do job.', 'error');
    } finally {
      setJobsDetailLoading(false);
    }
  };

  const handleImportOrdersNow = async (provider: Provider) => {
    if (!canManage) {
      addToast('Sem permissão para gerenciar integrações.', 'warning');
      return;
    }
    if (queueingImportProvider) return;

    const runningJob = jobsByProvider[provider].find((job) => job.status === 'pending' || job.status === 'processing');
    if (runningJob) {
      addToast('Já existe importação em andamento para este canal. Aguarde finalizar ou cancele o job atual.', 'info');
      return;
    }

    setQueueingImportProvider(provider);
    try {
      const knownIds = new Set(jobsByProvider[provider].map((job) => job.id));
      const dedupeBucket = Math.floor(Date.now() / 10000);
      const res = await enqueueEcommerceImportJob({
        provider,
        kind: 'import_orders',
        payload: {},
        idempotencyKey: `manual-ui-import_orders-${provider}-${dedupeBucket}`,
      });
      if (knownIds.has(res.job_id)) {
        addToast('Já havia um job equivalente na fila. Reutilizamos o mesmo enfileiramento.', 'info');
      } else {
        addToast(`Importação enfileirada (${res.status}). Acompanhe o progresso na lista abaixo.`, 'success');
      }
      if (provider === 'woo') {
        const { error } = await supabase.functions.invoke('marketplaces-sync', {
          body: { provider: 'woo', action: 'import_orders' },
        });
        if (error) {
          addToast('Job enfileirado. O worker não iniciou agora; a fila processará na próxima execução.', 'warning');
        }
      }
      await loadProviderJobs(provider, { append: false, offset: 0 });
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao enfileirar importação.', 'error');
    } finally {
      setQueueingImportProvider(null);
    }
  };

  const handleCancelJob = async (provider: Provider, jobId: string) => {
    if (!canManage || jobsActionId) return;
    setJobsActionId(jobId);
    try {
      const ok = await cancelEcommerceImportJob(jobId);
      addToast(ok ? 'Job cancelado.' : 'Job não pôde ser cancelado (talvez já finalizado).', ok ? 'success' : 'warning');
      await loadProviderJobs(provider, { append: false, offset: 0 });
      if (selectedJobId === jobId) {
        await handleOpenJobDetail(provider, jobId);
      }
    } catch (e: any) {
      addToast(e?.message || 'Falha ao cancelar job.', 'error');
    } finally {
      setJobsActionId(null);
    }
  };

  const handleRetryJob = async (provider: Provider, jobId: string) => {
    if (!canManage || jobsActionId) return;
    setJobsActionId(jobId);
    try {
      await retryEcommerceImportJob(jobId, 'manual_retry_from_ui');
      addToast('Reprocessamento enfileirado com sucesso.', 'success');
      await loadProviderJobs(provider, { append: false, offset: 0 });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reprocessar job.', 'error');
    } finally {
      setJobsActionId(null);
    }
  };

  if (permView.isLoading) {
    return <div className="text-sm text-gray-600">Carregando…</div>;
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Plug className="h-12 w-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-800">Acesso Negado</h2>
        <p className="text-gray-600 mt-1">Você não tem permissão para visualizar integrações.</p>
      </div>
    );
  }

  return (
    <div className="p-1 flex flex-col gap-4">
      <PageHeader
        title="Integrações com marketplaces"
        description="Conecte Shopee e Mercado Livre, habilite recursos e acompanhe saúde/retries."
        icon={<Plug className="w-5 h-5" />}
        actions={
          <>
            <RoadmapButton contextKey="integracoes" label="Assistente" title="Abrir assistente de Integrações" />
            <Button onClick={() => void fetchAll()} variant="outline" className="gap-2" disabled={loading}>
              <RefreshCw size={16} />
              Atualizar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-4">
          <div className="text-xs text-gray-500">Fila pendente</div>
          <div className="text-2xl font-bold text-gray-900">{health?.pending ?? 0}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-gray-500">Falhas (24h)</div>
          <div className="text-2xl font-bold text-gray-900">{health?.failed_24h ?? 0}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-gray-500">Último sync</div>
          <div className="text-sm font-semibold text-gray-900">{health?.last_sync_at ? new Date(health.last_sync_at).toLocaleString('pt-BR') : '—'}</div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(['meli', 'shopee', 'woo'] as Provider[]).map((provider) => {
          const conn = byProvider.get(provider);
          const isDisconnected = String(conn?.status ?? '').toLowerCase() === 'disconnected';
          const hasConnection = !!conn && !isDisconnected;
          const busy = busyProvider === provider;
          const pendingReason = provider === 'woo' ? wooPendingReason(conn ?? null, wooDiag, wooDiagUnavailable) : null;
          return (
            <GlassCard key={provider} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold text-gray-900">{providerLabels[provider]}</div>
                    {statusBadge(conn?.status)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {conn?.external_account_id ? `Conta: ${conn.external_account_id}` : 'Sem conta vinculada'}
                  </div>
                  {provider === 'woo' && pendingReason && String(conn?.status ?? '').toLowerCase() === 'pending' ? (
                    <div className="mt-2 inline-flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                      <AlertTriangle size={14} />
                      <span>{pendingReason}</span>
                    </div>
                  ) : null}
                  {conn?.last_error ? (
                    <div className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                      <AlertTriangle size={14} />
                      <span className="truncate max-w-[360px]" title={conn.last_error}>
                        {conn.last_error}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
                  {hasConnection ? (
                    <>
                      <Button
                        variant="outline"
                        className="gap-2 whitespace-nowrap"
                        disabled={loading || busy}
                        onClick={() => openConfig(provider)}
                        title="Configurar recursos"
                      >
                        <SettingsIcon size={16} />
                        Configurar
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2 whitespace-nowrap"
                        disabled={!canManage || loading || busy}
                        onClick={() => void handleDisconnect(provider)}
                        title={canManage ? 'Desconectar' : 'Sem permissão'}
                      >
                        <Unlink size={16} />
                        {busy ? 'Desconectando…' : 'Desconectar'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="gap-2 whitespace-nowrap"
                      disabled={!canManage || loading || busy}
                      onClick={() => void handleConnect(provider)}
                      title={canManage ? 'Iniciar conexão' : 'Sem permissão'}
                    >
                      <Link2 size={16} />
                      Conectar
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-700">
                <div className="font-medium">Recursos</div>
                <div className="mt-1 text-xs text-gray-500">
                  Ative somente o que você quer que a Ultria execute automaticamente. O resto fica “manual”.
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-2 text-sm">
                  <li className="flex items-center justify-between">
                    <span>Importar pedidos</span>
                    <span className="text-xs text-gray-500">{conn?.config?.import_orders ? 'Ativo' : 'Inativo'}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Sincronizar estoque</span>
                    <span className="text-xs text-gray-500">{conn?.config?.sync_stock ? 'Ativo' : 'Inativo'}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Atualizar rastreio/status</span>
                    <span className="text-xs text-gray-500">{conn?.config?.push_tracking ? 'Ativo' : 'Inativo'}</span>
                  </li>
                </ul>

                {conn?.status === 'connected' && conn?.config?.import_orders ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-gray-500">Importação assíncrona: você pode enfileirar múltiplas execuções e acompanhar status.</div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="gap-2"
                          disabled={!canManage || queueingImportProvider === provider}
                          onClick={() => void handleImportOrdersNow(provider)}
                          title={canManage ? 'Enfileirar importação' : 'Sem permissão'}
                        >
                          <RefreshCw size={16} />
                          {queueingImportProvider === provider ? 'Enfileirando…' : 'Nova importação'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2"
                          disabled={jobsLoadingProvider === provider}
                          onClick={() => void loadProviderJobs(provider, { append: false, offset: 0 })}
                        >
                          Atualizar
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-gray-500">Filtrar histórico</div>
                      <select
                        className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
                        value={jobsStatusFilterByProvider[provider]}
                        onChange={(e) => void handleChangeJobsFilter(provider, (e.target.value as JobStatusFilter) || 'all')}
                        disabled={jobsLoadingProvider === provider}
                      >
                        {jobStatusFilterOptions().map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-lg border border-gray-100 bg-white/70 p-2">
                      {jobsLoadingProvider === provider ? (
                        <div className="text-xs text-gray-500 px-1 py-2">Carregando jobs…</div>
                      ) : jobsByProvider[provider].length === 0 ? (
                        <div className="text-xs text-gray-500 px-1 py-2">Nenhuma importação encontrada para este canal.</div>
                      ) : (
                        <ul className="space-y-2">
                          {jobsByProvider[provider].map((job) => (
                            <li key={job.id} className="rounded border border-gray-100 bg-white px-2 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  {jobStatusBadge(job.status)}
                                  <span className="text-xs text-gray-500">{new Date(job.created_at).toLocaleString('pt-BR')}</span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  Itens: {job.items_total} | Falhas: {job.items_failed} | Tentativas: {job.attempts}/{job.max_attempts}
                                </div>
                              </div>
                              {job.last_error ? (
                                <div className="mt-1 text-xs text-red-700 truncate" title={job.last_error}>
                                  {job.last_error}
                                </div>
                              ) : null}
                              <div className="mt-2 flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void handleOpenJobDetail(provider, job.id)}
                                  disabled={jobsActionId === job.id}
                                >
                                  Detalhes
                                </Button>
                                {(job.status === 'pending' || job.status === 'processing') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!canManage || jobsActionId === job.id}
                                    onClick={() => void handleCancelJob(provider, job.id)}
                                  >
                                    {jobsActionId === job.id ? 'Cancelando…' : 'Cancelar'}
                                  </Button>
                                )}
                                {(job.status === 'error' || job.status === 'dead' || job.status === 'canceled') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!canManage || jobsActionId === job.id}
                                    onClick={() => void handleRetryJob(provider, job.id)}
                                  >
                                    {jobsActionId === job.id ? 'Reenfileirando…' : 'Reprocessar'}
                                  </Button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      {jobsHasMoreByProvider[provider] ? (
                        <div className="pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleLoadMoreJobs(provider)}
                            disabled={jobsLoadingProvider === provider}
                          >
                            {jobsLoadingProvider === provider ? 'Carregando…' : 'Carregar mais'}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <Dialog open={configOpen} onOpenChange={(v) => setConfigOpen(v)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assistente de integração</DialogTitle>
          </DialogHeader>

          {!activeConnection ? null : (
            <div className="space-y-4">
              <div className="text-sm text-gray-700">
                {providerLabels[activeConnection.provider as Provider]} — <span className="text-gray-500">passo a passo + recursos</span>
              </div>

              <GlassCard className="p-3">
                <div className="text-sm font-medium text-gray-900">1) Conectar</div>
                {activeConnection.provider === 'woo' ? (
                  <>
                    <div className="mt-1 text-xs text-gray-600">
                      No WooCommerce, a autenticação é feita via <span className="font-medium">Consumer Key/Secret</span> (Woo → Configurações → Avançado →
                      REST API). As credenciais ficam salvas no servidor (não aparecem novamente).
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="URL da loja"
                        value={String(activeConnection.config?.store_url ?? '')}
                        placeholder="https://sualoja.com.br"
                        onChange={(e) =>
                          setActiveConnection((prev) =>
                            prev ? { ...prev, config: { ...(prev.config ?? {}), store_url: (e.target as HTMLInputElement).value } } : prev,
                          )
                        }
                      />
                      <div />
                      <Input
                        label={
                          <div className="flex items-center justify-between gap-2">
                            <span>Consumer Key</span>
                            {wooDiag?.has_token ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium">
                                Salvo
                              </span>
                            ) : null}
                          </div>
                        }
                        value={
                          wooDiag?.has_token && !wooConsumerKey && !wooEditingConsumerKey
                            ? WOO_CREDENTIAL_MASK
                            : wooConsumerKey
                        }
                        placeholder={wooDiag?.has_token && !wooConsumerKey ? 'Salvo (mascarado)' : 'ck_...'}
                        onFocus={() => {
                          if (wooDiag?.has_token && !wooConsumerKey && !wooEditingConsumerKey) {
                            setWooEditingConsumerKey(true);
                            setWooConsumerKey('');
                          }
                        }}
                        onBlur={() => {
                          if (!wooConsumerKey) setWooEditingConsumerKey(false);
                        }}
                        onChange={(e) => {
                          setWooEditingConsumerKey(true);
                          setWooConsumerKey((e.target as HTMLInputElement).value);
                        }}
                        type="password"
                        helperText={
                          wooDiag?.has_token && !wooConsumerKey
                            ? 'Armazenado com segurança. Para substituir, cole uma nova chave.'
                            : 'Cole a chave gerada no WooCommerce (ck_...).'
                        }
                      />
                      <Input
                        label={
                          <div className="flex items-center justify-between gap-2">
                            <span>Consumer Secret</span>
                            {wooDiag?.has_token ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium">
                                Salvo
                              </span>
                            ) : null}
                          </div>
                        }
                        value={
                          wooDiag?.has_token && !wooConsumerSecret && !wooEditingConsumerSecret
                            ? WOO_CREDENTIAL_MASK
                            : wooConsumerSecret
                        }
                        placeholder={wooDiag?.has_token && !wooConsumerSecret ? 'Salvo (mascarado)' : 'cs_...'}
                        onFocus={() => {
                          if (wooDiag?.has_token && !wooConsumerSecret && !wooEditingConsumerSecret) {
                            setWooEditingConsumerSecret(true);
                            setWooConsumerSecret('');
                          }
                        }}
                        onBlur={() => {
                          if (!wooConsumerSecret) setWooEditingConsumerSecret(false);
                        }}
                        onChange={(e) => {
                          setWooEditingConsumerSecret(true);
                          setWooConsumerSecret((e.target as HTMLInputElement).value);
                        }}
                        type="password"
                        helperText={
                          wooDiag?.has_token && !wooConsumerSecret
                            ? 'Armazenado com segurança. Para substituir, cole um novo segredo.'
                            : 'Cole o secret gerado no WooCommerce (cs_...).'
                        }
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => void handleSaveWooSecrets()}
                        disabled={!canManage || wooSavingSecrets || !wooConsumerKey.trim() || !wooConsumerSecret.trim()}
                        title={canManage ? 'Salvar credenciais' : 'Sem permissão'}
                      >
                        <Link2 size={16} />
                        {wooSavingSecrets ? 'Salvando…' : 'Salvar credenciais'}
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => void handleTestConnection()}
                        disabled={testingProvider === 'woo'}
                      >
                        <RefreshCw size={16} />
                        {testingProvider === 'woo' ? 'Testando…' : 'Testar conexão'}
                      </Button>
                      <div className="text-xs text-gray-500">
                        Status atual: <span className="font-medium text-gray-700">{(diagnostics?.status ?? activeConnection.status) || '—'}</span>
                      </div>
                    </div>

                    {diagnostics ? (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                          <div className="text-gray-500">Loja</div>
                          <div className="font-medium text-gray-800 truncate" title={diagnostics.store_url || ''}>
                            {diagnostics.store_url || activeConnection.config?.store_url || '—'}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                          <div className="text-gray-500">Conectividade</div>
                          <div className="font-medium text-gray-800">{diagnostics.ok ? 'OK' : 'Falhou'}</div>
                        </div>
                        <div className="rounded-lg bg-white/70 border border-gray-100 p-2 sm:col-span-2">
                          <div className="text-gray-500">Mensagem</div>
                          <div className="font-medium text-gray-800 truncate" title={diagnostics.message || ''}>
                            {diagnostics.message || '—'}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="mt-1 text-xs text-gray-600">
                      Clique em “Autorizar no canal” para conectar. Ao voltar, use “Testar conexão” para validar (token/expiração/erro).
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => void handleAuthorize()}
                        disabled={!canManage || testingProvider === (activeConnection.provider as Provider)}
                        title={canManage ? 'Abrir autorização do canal' : 'Sem permissão'}
                      >
                        <Link2 size={16} />
                        {testingProvider === (activeConnection.provider as Provider) ? 'Aguarde…' : 'Autorizar no canal'}
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => void handleTestConnection()}
                        disabled={testingProvider === (activeConnection.provider as Provider)}
                      >
                        <RefreshCw size={16} />
                        {testingProvider === (activeConnection.provider as Provider) ? 'Testando…' : 'Testar conexão'}
                      </Button>
                      <div className="text-xs text-gray-500">
                        Status atual:{' '}
                        <span className="font-medium text-gray-700">{(diagnostics?.status ?? activeConnection.status) || '—'}</span>
                      </div>
                    </div>
                    {diagnostics ? (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                          <div className="text-gray-500">Conta</div>
                          <div className="font-medium text-gray-800">{diagnostics.external_account_id || '—'}</div>
                        </div>
                        <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                          <div className="text-gray-500">Token</div>
                          <div className="font-medium text-gray-800">
                            {diagnostics.has_token
                              ? diagnostics.token_expired
                                ? 'Expirado'
                                : diagnostics.token_expires_soon
                                  ? `Expira em breve${typeof diagnostics.token_expires_in_days === 'number' ? ` (${diagnostics.token_expires_in_days}d)` : ''}`
                                  : 'OK'
                              : 'Ausente'}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                          <div className="text-gray-500">Último sync</div>
                          <div className="font-medium text-gray-800">
                            {diagnostics.last_sync_at ? new Date(diagnostics.last_sync_at).toLocaleString('pt-BR') : '—'}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                          <div className="text-gray-500">Erro</div>
                          <div className="font-medium text-gray-800 truncate" title={diagnostics.last_error || ''}>
                            {diagnostics.last_error || '—'}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </GlassCard>

              {activeConnection.provider === 'woo' ? (
                <GlassCard className="p-3">
                  <div className="text-sm font-medium text-gray-900">1.1) Configuração Woo</div>
                  <div className="mt-1 text-xs text-gray-600">
                    Defina a base do estoque e da precificação para publicação no WooCommerce. Você pode ajustar manualmente por produto/lote depois (fase posterior).
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="Depósito (estoque)"
                      name="woo_deposito_id"
                      value={String(activeConnection.config?.deposito_id ?? '')}
                      disabled={wooOptionsLoading}
	                      onChange={(e) =>
	                        setActiveConnection((prev) =>
	                          prev
	                            ? { ...prev, config: { ...(prev.config ?? {}), deposito_id: (e.target as HTMLSelectElement).value || undefined } }
	                            : prev,
	                        )
	                      }
                    >
                      <option value="">{wooOptionsLoading ? 'Carregando…' : 'Selecionar…'}</option>
                      {wooDepositos.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nome}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="Tabela de preço (base)"
                      name="woo_base_tabela_preco_id"
                      value={String(activeConnection.config?.base_tabela_preco_id ?? '')}
                      disabled={wooOptionsLoading}
	                      onChange={(e) =>
	                        setActiveConnection((prev) =>
	                          prev
	                            ? { ...prev, config: { ...(prev.config ?? {}), base_tabela_preco_id: (e.target as HTMLSelectElement).value || undefined } }
	                            : prev,
	                        )
	                      }
                    >
                      <option value="">{wooOptionsLoading ? 'Carregando…' : 'Selecionar…'}</option>
                      {wooTabelasPreco.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                    </Select>

                    <Input
                      label="Ajuste padrão de preço (%)"
                      type="number"
                      inputMode="decimal"
                      value={String(activeConnection.config?.price_percent_default ?? '')}
                      placeholder="Ex.: 10"
                      onChange={(e) =>
                        setActiveConnection((prev) =>
                          prev
                            ? {
                                ...prev,
                                config: {
	                                  ...(prev.config ?? {}),
	                                  price_percent_default: (e.target as HTMLInputElement).value === ''
	                                    ? undefined
	                                    : Number((e.target as HTMLInputElement).value),
	                                },
	                              }
	                            : prev,
                        )
                      }
                    />
                    <div className="text-xs text-gray-500 leading-relaxed self-end">
                      Ex.: 10 = +10%. Use 0 para sem ajuste. Valores negativos são permitidos.
                    </div>
                  </div>
                </GlassCard>
              ) : null}

              <GlassCard className="p-3">
                <div className="text-sm font-medium text-gray-900">2) Ativar recursos</div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-800">Importar pedidos</div>
                      <div className="text-xs text-gray-500">Cria pedidos no Ultria ERP com canal=marketplace.</div>
                    </div>
                    <Switch
                    checked={!!activeConnection.config?.import_orders}
                    onCheckedChange={(checked) =>
                      setActiveConnection((prev) => (prev ? { ...prev, config: { ...(prev.config ?? {}), import_orders: checked } } : prev))
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">Sincronizar estoque</div>
                    <div className="text-xs text-gray-500">Envia saldo disponível por SKU (respeita limites).</div>
                  </div>
                  <Switch
                    checked={!!activeConnection.config?.sync_stock}
                    onCheckedChange={(checked) =>
                      setActiveConnection((prev) => (prev ? { ...prev, config: { ...(prev.config ?? {}), sync_stock: checked } } : prev))
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">Atualizar rastreio/status</div>
                    <div className="text-xs text-gray-500">Reflete expedição (tracking/status) no canal.</div>
                  </div>
                  <Switch
                    checked={!!activeConnection.config?.push_tracking}
                    onCheckedChange={(checked) =>
                      setActiveConnection((prev) => (prev ? { ...prev, config: { ...(prev.config ?? {}), push_tracking: checked } } : prev))
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-3 border-t pt-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">Modo seguro (recomendado)</div>
                    <div className="text-xs text-gray-500">Evita ações perigosas (guardrails + simulação quando possível).</div>
                  </div>
                  <Switch
                    checked={activeConnection.config?.safe_mode !== false}
                    onCheckedChange={(checked) =>
                      setActiveConnection((prev) => (prev ? { ...prev, config: { ...(prev.config ?? {}), safe_mode: checked } } : prev))
                    }
                  />
                </div>
              </GlassCard>

              <GlassCard className="p-3">
                <div className="text-sm font-medium text-gray-900">3) Mapear produtos (recomendado)</div>
                <div className="mt-1 text-xs text-gray-600">
                  Para importar itens corretamente, mapeie cada produto do Ultria ERP com o ID do anúncio no canal.
                </div>
                {activeConnection.provider === 'woo' ? (
                  <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600">
                    <div className="font-medium text-gray-800">Em desenvolvimento</div>
                    <div className="mt-1">
                      O mapeamento de produtos para WooCommerce ainda não foi liberado. Assim que estiver pronto, o botão aparecerá aqui.
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="outline"
                      className="gap-2"
                      disabled={!canManage || String(activeConnection.status ?? '').toLowerCase() !== 'connected'}
                      onClick={() => void openMappings(activeConnection.provider as CatalogProvider)}
                      title={
                        !canManage
                          ? 'Sem permissão'
                          : String(activeConnection.status ?? '').toLowerCase() !== 'connected'
                            ? 'Conecte a integração para liberar o mapeamento'
                            : 'Abrir mapeamento'
                      }
                    >
                      <SettingsIcon size={16} />
                      Abrir mapeamento
                    </Button>
                  </div>
                )}
              </GlassCard>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfigOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => void handleSaveConfig()} disabled={!canManage || savingConfig} className="gap-2">
                  {savingConfig ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={jobsDetailOpen}
        onOpenChange={(v) => {
          setJobsDetailOpen(v);
          if (!v) {
            setSelectedJobId(null);
            setSelectedJobProvider(null);
            setSelectedJobDetail(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da importação</DialogTitle>
          </DialogHeader>
          {jobsDetailLoading ? (
            <div className="text-sm text-gray-600">Carregando detalhes…</div>
          ) : !selectedJobDetail || !selectedJobId || !selectedJobProvider ? (
            <div className="text-sm text-gray-600">Selecione um job para visualizar os detalhes.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-100 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-gray-800">
                    {providerLabels[selectedJobProvider]} · Job {selectedJobId.slice(0, 8)}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleOpenJobDetail(selectedJobProvider, selectedJobId)}
                    disabled={jobsDetailLoading}
                  >
                    Atualizar detalhe
                  </Button>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Runs: {selectedJobDetail.runs.length} · Itens: {selectedJobDetail.items.length}
                </div>
              </div>

              <GlassCard className="p-3">
                <div className="text-sm font-medium text-gray-900">Execuções (runs)</div>
                {selectedJobDetail.runs.length === 0 ? (
                  <div className="mt-2 text-xs text-gray-500">Sem runs registradas.</div>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {selectedJobDetail.runs.map((run) => (
                      <li key={run.id} className="rounded border border-gray-100 bg-white px-2 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className={run.ok ? 'text-emerald-700' : 'text-red-700'}>{run.ok ? 'OK' : 'Falha'}</span>
                          <span className="text-gray-500">
                            {new Date(run.started_at).toLocaleString('pt-BR')}
                            {run.finished_at ? ` → ${new Date(run.finished_at).toLocaleString('pt-BR')}` : ''}
                          </span>
                        </div>
                        {run.error ? <div className="mt-1 text-xs text-red-700">{run.error}</div> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </GlassCard>

              <GlassCard className="p-3">
                <div className="text-sm font-medium text-gray-900">Itens processados</div>
                {selectedJobDetail.items.length === 0 ? (
                  <div className="mt-2 text-xs text-gray-500">Sem itens detalhados neste job.</div>
                ) : (
                  <div className="mt-2 overflow-x-auto border rounded-lg bg-white">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">Status</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">SKU</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">External ID</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">Mensagem</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedJobDetail.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-2 py-2">{item.status}</td>
                            <td className="px-2 py-2">{item.sku || '—'}</td>
                            <td className="px-2 py-2">{item.external_id || '—'}</td>
                            <td className="px-2 py-2">{item.message || '—'}</td>
                            <td className="px-2 py-2">{new Date(item.created_at).toLocaleString('pt-BR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </GlassCard>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={mappingsOpen} onOpenChange={(v) => setMappingsOpen(v)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Mapeamento de produtos — {providerLabels[mappingsProvider]}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Buscar produto (nome/SKU) ou anúncio"
                  value={mappingsQuery}
                  onChange={(e) => setMappingsQuery((e.target as HTMLInputElement).value)}
                  placeholder="Ex.: Parafuso, SKU-123, MLB123..."
                />
              </div>
              <Button variant="outline" className="gap-2" onClick={() => void loadMappings(mappingsProvider, mappingsQuery)} disabled={mappingsLoading}>
                <RefreshCw size={16} />
                Buscar
              </Button>
            </div>

            {mappingsLoading ? (
              <div className="text-sm text-gray-600">Carregando…</div>
            ) : mappings.length === 0 ? (
              <div className="text-sm text-gray-600">Nenhum produto encontrado.</div>
            ) : (
              <div className="overflow-x-auto border rounded-xl bg-white">
                <table className="min-w-full divide-y divide-gray-200 table-fixed">
                  <TableColGroup columns={mappingsColumns} widths={mappingsWidths} />
                  <thead className="bg-gray-50">
                    <tr>
                      <ResizableSortableTh
                        columnId="produto"
                        label="Produto"
                        sort={mappingsSort}
                        onSort={(col) => setMappingsSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startMappingsResize}
                        className="px-3 py-2"
                      />
                      <ResizableSortableTh
                        columnId="sku"
                        label="SKU"
                        sort={mappingsSort}
                        onSort={(col) => setMappingsSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startMappingsResize}
                        className="px-3 py-2"
                      />
                      <ResizableSortableTh
                        columnId="anuncio"
                        label="ID anúncio no canal"
                        sort={mappingsSort}
                        onSort={(col) => setMappingsSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startMappingsResize}
                        className="px-3 py-2"
                      />
                      <ResizableSortableTh
                        columnId="acoes"
                        label={<span className="sr-only">Ações</span>}
                        sortable={false}
                        sort={mappingsSort}
                        onResizeStart={startMappingsResize}
                        align="right"
                        className="px-3 py-2"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {mappingsSorted.map((row) => {
                      const busy = savingMapId === row.produto_id;
                      return (
                        <MappingRow
                          key={row.produto_id}
                          row={row}
                          busy={busy}
                          onSave={(value) => void handleSaveMapping(row, value)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MappingRow(props: {
  row: EcommerceProductMappingRow;
  busy: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(props.row.anuncio_identificador ?? '');
  useEffect(() => setValue(props.row.anuncio_identificador ?? ''), [props.row.anuncio_identificador]);

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2 text-sm text-gray-800">{props.row.produto_nome}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{props.row.produto_sku || '—'}</td>
      <td className="px-3 py-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex.: MLB123..."
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" variant="outline" disabled={props.busy} onClick={() => props.onSave(value)} className="gap-2">
          <SettingsIcon size={14} />
          {props.busy ? 'Salvando…' : 'Salvar'}
        </Button>
      </td>
    </tr>
  );
}
