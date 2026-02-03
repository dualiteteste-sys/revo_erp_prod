import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plug, RefreshCw, Settings as SettingsIcon, Unlink, Link2, AlertTriangle } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { useHasPermission } from '@/hooks/useHasPermission';
import { supabase } from '@/lib/supabaseClient';
import {
  type EcommerceConnection,
  disconnectEcommerceConnection,
  getEcommerceConnectionDiagnostics,
  getEcommerceHealthSummary,
  listEcommerceConnections,
  setWooConnectionSecrets,
  upsertEcommerceConnection,
  updateEcommerceConnectionConfig,
  type EcommerceHealthSummary,
} from '@/services/ecommerceIntegrations';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { listEcommerceProductMappings, upsertEcommerceProductMapping, type EcommerceProductMappingRow } from '@/services/ecommerceCatalog';
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
  const [syncingOrders, setSyncingOrders] = useState<Provider | null>(null);
  const [mappingsOpen, setMappingsOpen] = useState(false);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [mappingsProvider, setMappingsProvider] = useState<Provider>('meli');
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

  const fetchAll = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [c, h] = await Promise.all([listEcommerceConnections(), getEcommerceHealthSummary()]);
      setConnections(c);
      setHealth(h);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar integrações.', 'error');
      setConnections([]);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [addToast, canView]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

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
    setConfigOpen(true);
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
      addToast('Configurações salvas.', 'success');
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
      addToast('Credenciais salvas.', 'success');
      setWooConsumerKey('');
      setWooConsumerSecret('');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar credenciais.', 'error');
    } finally {
      setWooSavingSecrets(false);
    }
  };

  const loadMappings = useCallback(
    async (provider: Provider, q?: string) => {
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

  const openMappings = async (provider: Provider) => {
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

  const handleImportOrdersNow = async (provider: Provider) => {
    if (!supabase) {
      addToast('Supabase client indisponível.', 'error');
      return;
    }
    if (!canManage) {
      addToast('Sem permissão para gerenciar integrações.', 'warning');
      return;
    }
    if (syncingOrders) return;

    setSyncingOrders(provider);
    try {
      const { data, error } = await supabase.functions.invoke('marketplaces-sync', {
        body: { provider, action: 'import_orders' },
      });
      if (error) throw error;
      const imported = (data as any)?.imported ?? 0;
      const skipped = (data as any)?.skipped_items ?? 0;
      addToast(`Importação concluída: ${imported} pedidos. Itens sem mapeamento: ${skipped}.`, 'success');
      await fetchAll();
    } catch (e: any) {
      const status = e?.context?.status ?? e?.status ?? null;
      const rawBody = e?.context?.body ?? null;
      let body: any = null;
      if (rawBody) {
        try {
          body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
        } catch {
          body = rawBody;
        }
      }

      if (status === 409 && body?.error === 'ALREADY_RUNNING') {
        addToast('Já existe uma importação em andamento. Aguarde alguns instantes e tente novamente.', 'info');
        return;
      }

      if (status === 503 && body?.error === 'CIRCUIT_OPEN') {
        const retryAfter = body?.retry_after_seconds ? Number(body.retry_after_seconds) : null;
        const minutes = retryAfter ? Math.max(1, Math.ceil(retryAfter / 60)) : null;
        addToast(
          `Integração temporariamente instável. Tente novamente${minutes ? ` em ~${minutes} min` : ''}. Se persistir, abra Dev → Saúde para ver filas/DLQ.`,
          'warning',
        );
        return;
      }

      if (status === 429 && body?.error === 'RATE_LIMITED') {
        const retryAfter = body?.retry_after_seconds ? Number(body.retry_after_seconds) : null;
        const seconds = retryAfter ? Math.max(1, Math.ceil(retryAfter)) : null;
        addToast(`Muitas tentativas em pouco tempo. Tente novamente${seconds ? ` em ~${seconds}s` : ''}.`, 'warning');
        return;
      }

      addToast(e?.message || 'Falha ao importar pedidos.', 'error');
    } finally {
      setSyncingOrders(null);
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
          const busy = busyProvider === provider;
          return (
            <GlassCard key={provider} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold text-gray-900">{providerLabels[provider]}</div>
                    {statusBadge(conn?.status)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {conn?.external_account_id ? `Conta: ${conn.external_account_id}` : 'Sem conta vinculada'}
                  </div>
                  {conn?.last_error ? (
                    <div className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                      <AlertTriangle size={14} />
                      <span className="truncate max-w-[360px]" title={conn.last_error}>
                        {conn.last_error}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {conn ? (
                    <>
                      <Button
                        variant="outline"
                        className="gap-2"
                        disabled={loading || busy}
                        onClick={() => openConfig(provider)}
                        title="Configurar recursos"
                      >
                        <SettingsIcon size={16} />
                        Configurar
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        disabled={!canManage || loading || busy}
                        onClick={() => void handleDisconnect(provider)}
                        title={canManage ? 'Desconectar' : 'Sem permissão'}
                      >
                        <Unlink size={16} />
                        Desconectar
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="gap-2"
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
                  Ative somente o que você quer que o Revo execute automaticamente. O resto fica “manual”.
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

                {provider === 'meli' && conn?.status === 'connected' && conn?.config?.import_orders ? (
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="text-xs text-gray-500">
                      Importa pedidos recentes e cria/atualiza `Pedidos de Venda` automaticamente.
                    </div>
                    <Button
                      variant="outline"
                      className="gap-2"
                      disabled={!canManage || syncingOrders === 'meli'}
                      onClick={() => void handleImportOrdersNow('meli')}
                      title={canManage ? 'Importar agora' : 'Sem permissão'}
                    >
                      <RefreshCw size={16} />
                      {syncingOrders === 'meli' ? 'Importando…' : 'Importar agora'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <Dialog open={configOpen} onOpenChange={(v) => setConfigOpen(v)}>
        <DialogContent className="max-w-xl">
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
                        label="Consumer Key"
                        value={wooConsumerKey}
                        placeholder="ck_..."
                        onChange={(e) => setWooConsumerKey((e.target as HTMLInputElement).value)}
                      />
                      <Input
                        label="Consumer Secret"
                        value={wooConsumerSecret}
                        placeholder="cs_..."
                        onChange={(e) => setWooConsumerSecret((e.target as HTMLInputElement).value)}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => void handleSaveWooSecrets()}
                        disabled={!canManage || wooSavingSecrets}
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
                            ? { ...prev, config: { ...(prev.config ?? {}), deposito_id: (e.target as HTMLSelectElement).value || null } }
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
                            ? { ...prev, config: { ...(prev.config ?? {}), base_tabela_preco_id: (e.target as HTMLSelectElement).value || null } }
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
                                    ? null
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

              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-900">2) Ativar recursos</div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">Importar pedidos</div>
                    <div className="text-xs text-gray-500">Cria pedidos no Revo com canal=marketplace.</div>
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
              </div>

              <GlassCard className="p-3">
                <div className="text-sm font-medium text-gray-900">3) Mapear produtos (recomendado)</div>
                <div className="mt-1 text-xs text-gray-600">
                  Para importar itens corretamente, mapeie cada produto do Revo com o ID do anúncio no canal.
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={!canManage}
                    onClick={() => void openMappings(activeConnection.provider as Provider)}
                    title={canManage ? 'Abrir mapeamento' : 'Sem permissão'}
                  >
                    <SettingsIcon size={16} />
                    Abrir mapeamento
                  </Button>
                </div>
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
