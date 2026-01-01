import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plug, RefreshCw, Settings as SettingsIcon, Unlink, Link2, AlertTriangle } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { useHasPermission } from '@/hooks/useHasPermission';
import {
  type EcommerceConnection,
  disconnectEcommerceConnection,
  getEcommerceHealthSummary,
  listEcommerceConnections,
  upsertEcommerceConnection,
  updateEcommerceConnectionConfig,
  type EcommerceHealthSummary,
} from '@/services/ecommerceIntegrations';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

type Provider = 'meli' | 'shopee';

const providerLabels: Record<Provider, string> = {
  meli: 'Mercado Livre',
  shopee: 'Shopee',
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
      await upsertEcommerceConnection({
        provider,
        nome: providerLabels[provider],
        status: 'pending',
        config: defaultConfig(),
      });
      addToast('Integração criada. Agora configure as credenciais do canal para concluir a conexão.', 'success');
      await fetchAll();
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
    setConfigOpen(true);
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
          <Button onClick={() => void fetchAll()} variant="outline" className="gap-2" disabled={loading}>
            <RefreshCw size={16} />
            Atualizar
          </Button>
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
        {(['meli', 'shopee'] as Provider[]).map((provider) => {
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
              </div>
            </GlassCard>
          );
        })}
      </div>

      <Dialog open={configOpen} onOpenChange={(v) => setConfigOpen(v)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Configurar integração</DialogTitle>
          </DialogHeader>

          {!activeConnection ? null : (
            <div className="space-y-4">
              <div className="text-sm text-gray-700">
                {providerLabels[activeConnection.provider as Provider]} — <span className="text-gray-500">recursos e modo seguro</span>
              </div>

              <div className="space-y-3">
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
    </div>
  );
}

