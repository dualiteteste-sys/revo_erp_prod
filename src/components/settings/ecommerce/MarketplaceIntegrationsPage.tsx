import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Plug, RefreshCw, Settings as SettingsIcon, Unlink } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import Input from '@/components/ui/forms/Input';

import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useHasPermission } from '@/hooks/useHasPermission';
import { supabase } from '@/lib/supabaseClient';
import {
  type EcommerceConnection,
  disconnectEcommerceConnection,
  getEcommerceConnectionDiagnostics,
  getEcommerceHealthSummary,
  listEcommerceConnections,
  normalizeEcommerceConfig,
  upsertEcommerceConnection,
  updateEcommerceConnectionConfig,
  type EcommerceHealthSummary,
} from '@/services/ecommerceIntegrations';
import { MARKETPLACE_PROVIDER_DEFINITIONS, MARKETPLACE_PROVIDER_IDS, type MarketplaceProvider } from '@/services/marketplaceFramework';

type Provider = MarketplaceProvider;

function statusBadge(status?: string | null) {
  const s = String(status || 'disconnected').toLowerCase();
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
    sync_prices: false,
    push_tracking: false,
    safe_mode: true,
    auto_sync_enabled: false,
    sync_interval_minutes: 15,
  };
}

export default function MarketplaceIntegrationsPage() {
  const { addToast } = useToast();
  const { activeEmpresaId } = useAuth();
  const permView = useHasPermission('ecommerce', 'view');
  const permManage = useHasPermission('ecommerce', 'manage');

  const canView = permView.allowed;
  const canManage = permManage.allowed;
  const providers = MARKETPLACE_PROVIDER_IDS as Provider[];

  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<EcommerceConnection[]>([]);
  const [health, setHealth] = useState<EcommerceHealthSummary | null>(null);
  const [diagByProvider, setDiagByProvider] = useState<Record<string, any>>({});

  const [configOpen, setConfigOpen] = useState(false);
  const [activeConnection, setActiveConnection] = useState<EcommerceConnection | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null);

  const providerLabels: Record<Provider, string> = useMemo(() => {
    return Object.fromEntries(providers.map((p) => [p, MARKETPLACE_PROVIDER_DEFINITIONS[p].label])) as Record<Provider, string>;
  }, [providers]);

  const fetchAll = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [conns, h] = await Promise.all([listEcommerceConnections(), getEcommerceHealthSummary()]);
      setConnections(conns ?? []);
      setHealth(h ?? null);

      const nextDiag: Record<string, any> = {};
      await Promise.all(
        providers.map(async (p) => {
          try {
            nextDiag[p] = await getEcommerceConnectionDiagnostics(p);
          } catch {
            nextDiag[p] = null;
          }
        }),
      );
      setDiagByProvider(nextDiag);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar integracoes.', 'error');
      setConnections([]);
      setHealth(null);
      setDiagByProvider({});
    } finally {
      setLoading(false);
    }
  }, [addToast, canView, providers]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const connByProvider = useMemo(() => {
    const map: Record<string, EcommerceConnection | null> = {};
    for (const p of providers) map[p] = null;
    for (const c of connections) map[c.provider] = c;
    return map;
  }, [connections, providers]);

  const handleOpenConfig = (provider: Provider) => {
    const conn = connByProvider[provider];
    if (!conn) {
      const nome = providerLabels[provider] ?? provider;
      setActiveConnection({
        id: 'new',
        empresa_id: activeEmpresaId ?? '',
        provider,
        nome,
        status: 'pending',
        external_account_id: null,
        config: defaultConfig(),
        last_sync_at: null,
        last_error: null,
        connected_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
    } else {
      setActiveConnection({ ...conn, config: normalizeEcommerceConfig(conn.config ?? {}) });
    }
    setConfigOpen(true);
  };

  const handleDisconnect = async (provider: Provider) => {
    const conn = connByProvider[provider];
    if (!conn) return;
    if (!canManage) {
      addToast('Sem permissao para gerenciar integracoes.', 'warning');
      return;
    }
    if (busyProvider) return;

    setBusyProvider(provider);
    try {
      await disconnectEcommerceConnection(conn.id);
      addToast('Integracao desconectada.', 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao desconectar integracao.', 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const handleTestConnection = async (provider: Provider) => {
    if (!canView) return;
    if (testingProvider) return;
    setTestingProvider(provider);
    try {
      const diag = await getEcommerceConnectionDiagnostics(provider);
      setDiagByProvider((prev) => ({ ...prev, [provider]: diag as any }));
      if (diag.status === 'connected' && diag.has_token && !diag.token_expired) {
        addToast('Conexao OK.', 'success');
      } else {
        addToast('Conexao ainda incompleta. Use "Conectar" para refazer o OAuth.', 'warning');
      }
    } catch (e: any) {
      addToast(e?.message || 'Falha ao verificar conexao.', 'error');
      setDiagByProvider((prev) => ({ ...prev, [provider]: null }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleAuthorize = async (provider: Provider) => {
    if (!supabase) {
      addToast('Supabase client indisponivel.', 'error');
      return;
    }
    if (!canManage) {
      addToast('Sem permissao para gerenciar integracoes.', 'warning');
      return;
    }
    if (testingProvider) return;

    setTestingProvider(provider);
    try {
      const existing = connByProvider[provider];
      if (!existing) {
        await upsertEcommerceConnection({
          provider,
          nome: providerLabels[provider] ?? provider,
          status: 'pending',
          external_account_id: null,
          config: defaultConfig(),
        });
      }

      const redirect_to = `${window.location.origin}/app/configuracoes/ecommerce/marketplaces`;
      const { data, error } = await supabase.functions.invoke('marketplaces-oauth', {
        body: { action: 'start', provider, redirect_to },
      });
      if (error) throw error;
      const url = (data as any)?.url as string | undefined;
      if (!url) throw new Error('URL de autorizacao nao retornada.');
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
      addToast('Sem permissao para gerenciar integracoes.', 'warning');
      return;
    }
    if (savingConfig) return;

    setSavingConfig(true);
    try {
      const normalizedConfig = normalizeEcommerceConfig(activeConnection.config ?? {});
      if (activeConnection.id === 'new') {
        await upsertEcommerceConnection({
          provider: activeConnection.provider as any,
          nome: String(activeConnection.nome || providerLabels[activeConnection.provider as Provider] || activeConnection.provider),
          status: activeConnection.status ?? 'pending',
          external_account_id: activeConnection.external_account_id ?? null,
          config: normalizedConfig,
        });
      } else {
        await updateEcommerceConnectionConfig(activeConnection.id, normalizedConfig);
      }

      addToast('Configuracoes salvas.', 'success');
      setConfigOpen(false);
      setActiveConnection(null);
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar configuracoes.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="E-commerce / Marketplaces"
        subtitle="Conecte canais (OAuth) e configure sincronizacao."
        icon={<Plug className="text-blue-600" />}
      />

      {!canView ? (
        <GlassCard className="p-6">
          <div className="text-sm text-gray-700">Sem permissao para visualizar integracoes.</div>
        </GlassCard>
      ) : loading ? (
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <RefreshCw className="h-4 w-4 animate-spin" /> Carregando integracoes...
          </div>
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {providers.map((provider) => {
              const conn = connByProvider[provider];
              const diag = (diagByProvider as any)?.[provider] ?? null;
              const shownStatus = conn?.status ?? (diag?.status ?? 'disconnected');

              return (
                <GlassCard key={provider} className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                        <Plug size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{providerLabels[provider]}</div>
                        <div className="text-xs text-gray-600">{MARKETPLACE_PROVIDER_DEFINITIONS[provider].summary}</div>
                      </div>
                    </div>
                    <div className="shrink-0">{statusBadge(shownStatus)}</div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleOpenConfig(provider)}
                      className="gap-2"
                      disabled={!canManage}
                      title={!canManage ? 'Sem permissao para gerenciar integracoes.' : undefined}
                    >
                      <SettingsIcon size={16} />
                      Configurar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleTestConnection(provider)}
                      className="gap-2"
                      disabled={testingProvider === provider}
                    >
                      <RefreshCw size={16} className={testingProvider === provider ? 'animate-spin' : ''} />
                      {testingProvider === provider ? 'Verificando...' : 'Verificar'}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleAuthorize(provider)}
                      className="gap-2"
                      disabled={!canManage || testingProvider === provider}
                    >
                      <Link2 size={16} />
                      Conectar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleDisconnect(provider)}
                      className="gap-2"
                      disabled={!conn || busyProvider === provider || !canManage}
                    >
                      <Unlink size={16} />
                      Desconectar
                    </Button>
                  </div>
                </GlassCard>
              );
            })}
          </div>

          <GlassCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Saude</div>
                <div className="text-xs text-gray-600">Resumo de pendencias e falhas nas ultimas 24h.</div>
              </div>
              <Button type="button" variant="secondary" onClick={() => void fetchAll()} className="gap-2">
                <RefreshCw size={16} /> Atualizar
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border bg-white px-4 py-3">
                <div className="text-xs text-gray-600">Pendentes</div>
                <div className="text-lg font-bold text-gray-900">{health?.pending ?? 0}</div>
              </div>
              <div className="rounded-xl border bg-white px-4 py-3">
                <div className="text-xs text-gray-600">Falhas (24h)</div>
                <div className="text-lg font-bold text-gray-900">{health?.failed_24h ?? 0}</div>
              </div>
              <div className="rounded-xl border bg-white px-4 py-3">
                <div className="text-xs text-gray-600">Ultimo sync</div>
                <div className="text-sm font-semibold text-gray-900">
                  {health?.last_sync_at ? new Date(health.last_sync_at).toLocaleString() : 'N/A'}
                </div>
              </div>
            </div>
          </GlassCard>

          <Dialog isOpen={configOpen} onOpenChange={(v) => setConfigOpen(v)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Configurar integracao</DialogTitle>
              </DialogHeader>
              {activeConnection ? (
                <div className="space-y-4">
                  <Input
                    label="Nome"
                    value={activeConnection.nome ?? ''}
                    onChange={(e) => setActiveConnection((prev) => (prev ? { ...prev, nome: e.target.value } : prev))}
                    disabled={!canManage || savingConfig}
                  />

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border bg-white px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Importar pedidos</div>
                        <div className="text-xs text-gray-600">Enfileira importacao periodica.</div>
                      </div>
                      <Switch
                        checked={activeConnection.config?.import_orders !== false}
                        onCheckedChange={(checked) =>
                          setActiveConnection((prev) =>
                            prev ? { ...prev, config: { ...(prev.config ?? {}), import_orders: checked } } : prev,
                          )
                        }
                        disabled={!canManage || savingConfig}
                      />
                    </div>
                    <div className="rounded-xl border bg-white px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Modo seguro</div>
                        <div className="text-xs text-gray-600">Evita acoes destrutivas.</div>
                      </div>
                      <Switch
                        checked={activeConnection.config?.safe_mode !== false}
                        onCheckedChange={(checked) =>
                          setActiveConnection((prev) =>
                            prev ? { ...prev, config: { ...(prev.config ?? {}), safe_mode: checked } } : prev,
                          )
                        }
                        disabled={!canManage || savingConfig}
                      />
                    </div>
                    <div className="rounded-xl border bg-white px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Sincronizar estoque</div>
                        <div className="text-xs text-gray-600">Publica saldo do ERP no canal.</div>
                      </div>
                      <Switch
                        checked={activeConnection.config?.sync_stock === true}
                        onCheckedChange={(checked) =>
                          setActiveConnection((prev) =>
                            prev ? { ...prev, config: { ...(prev.config ?? {}), sync_stock: checked } } : prev,
                          )
                        }
                        disabled={!canManage || savingConfig}
                      />
                    </div>
                    <div className="rounded-xl border bg-white px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Sincronizar precos</div>
                        <div className="text-xs text-gray-600">Publica tabela de precos no canal.</div>
                      </div>
                      <Switch
                        checked={activeConnection.config?.sync_prices === true}
                        onCheckedChange={(checked) =>
                          setActiveConnection((prev) =>
                            prev ? { ...prev, config: { ...(prev.config ?? {}), sync_prices: checked } } : prev,
                          )
                        }
                        disabled={!canManage || savingConfig}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => setConfigOpen(false)} disabled={savingConfig}>
                      Cancelar
                    </Button>
                    <Button type="button" onClick={() => void handleSaveConfig()} disabled={!canManage || savingConfig} className="gap-2">
                      <SettingsIcon size={16} />
                      {savingConfig ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

