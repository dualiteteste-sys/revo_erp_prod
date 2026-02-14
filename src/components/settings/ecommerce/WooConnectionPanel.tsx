import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2, RefreshCw, Unlink } from 'lucide-react';
import { Link } from 'react-router-dom';

import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { supabase } from '@/lib/supabaseClient';
import { normalizeWooStoreUrl } from '@/lib/ecommerce/wooStoreUrl';
import {
  disconnectEcommerceConnection,
  getEcommerceConnectionDiagnostics,
  listEcommerceConnections,
  normalizeEcommerceConfig,
  setWooConnectionSecrets,
  setWooStoreUrl,
  updateEcommerceConnectionConfig,
  upsertEcommerceConnection,
  type EcommerceConnection,
} from '@/services/ecommerceIntegrations';

const WOO_MASK = '••••••••••••••••';
const DEFAULT_WOO_CONFIG = normalizeEcommerceConfig({});

type WooConfigDraft = {
  import_orders: boolean;
  sync_stock: boolean;
  sync_prices: boolean;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  price_percent_default: number;
};

function toWooConfigDraft(connection: EcommerceConnection | null): WooConfigDraft {
  const config = normalizeEcommerceConfig(connection?.config ?? {});
  return {
    import_orders: config.import_orders !== false,
    sync_stock: config.sync_stock === true,
    sync_prices: config.sync_prices === true,
    auto_sync_enabled: config.auto_sync_enabled === true,
    sync_interval_minutes: Number(config.sync_interval_minutes ?? 15),
    price_percent_default: Number(config.price_percent_default ?? 0),
  };
}

function pickPreferredWooConnection(rows: EcommerceConnection[], currentConnectionId?: string | null): EcommerceConnection | null {
  const wooRows = rows.filter((row) => row.provider === 'woo');
  if (wooRows.length === 0) return null;

  if (currentConnectionId) {
    const same = wooRows.find((row) => row.id === currentConnectionId);
    if (same) return same;
  }

  const sorted = [...wooRows].sort((a, b) => {
    const statusScore = (status: string | null | undefined) => {
      const normalized = String(status ?? '').toLowerCase();
      if (normalized === 'connected') return 0;
      if (normalized === 'pending') return 1;
      if (normalized === 'error') return 2;
      if (normalized === 'disconnected') return 4;
      return 3;
    };
    const urlScore = (row: EcommerceConnection) => (String(row?.config?.store_url ?? '').trim() ? 0 : 1);
    const updatedA = new Date(a.updated_at).getTime();
    const updatedB = new Date(b.updated_at).getTime();

    const statusDiff = statusScore(a.status) - statusScore(b.status);
    if (statusDiff !== 0) return statusDiff;

    const storeUrlDiff = urlScore(a) - urlScore(b);
    if (storeUrlDiff !== 0) return storeUrlDiff;

    return updatedB - updatedA;
  });

  return sorted[0] ?? null;
}

function statusBadge(status?: string | null) {
  const normalized = String(status ?? 'disconnected').toLowerCase();
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
  if (normalized === 'connected') return <span className={`${base} bg-emerald-100 text-emerald-800`}>Conectado</span>;
  if (normalized === 'pending') return <span className={`${base} bg-amber-100 text-amber-800`}>Pendente</span>;
  if (normalized === 'error') return <span className={`${base} bg-red-100 text-red-800`}>Erro</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>Desconectado</span>;
}

export default function WooConnectionPanel() {
  const { addToast } = useToast();
  const { activeEmpresaId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [connection, setConnection] = useState<EcommerceConnection | null>(null);
  const [storeUrl, setStoreUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [configDraft, setConfigDraft] = useState<WooConfigDraft>(toWooConfigDraft(null));
  const [hasConsumerKey, setHasConsumerKey] = useState(false);
  const [hasConsumerSecret, setHasConsumerSecret] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusValue, setStatusValue] = useState<string>('disconnected');
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeEmpresaId) {
      setConnection(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listEcommerceConnections();
      const woo = pickPreferredWooConnection(rows, connection?.id ?? null);
      setConnection(woo);
      setStoreUrl(String(woo?.config?.store_url ?? ''));
      setConfigDraft(toWooConfigDraft(woo));
      setStatusValue(String(woo?.status ?? 'disconnected').toLowerCase());
      setStatusMessage(woo?.last_error ? String(woo.last_error) : null);
      if (woo) {
        try {
          const diagnostics = await getEcommerceConnectionDiagnostics('woo');
          setHasConsumerKey(diagnostics.has_consumer_key === true);
          setHasConsumerSecret(diagnostics.has_consumer_secret === true);
          setLastVerifiedAt(diagnostics.last_verified_at ?? null);
          const status = String(diagnostics.connection_status ?? '').toLowerCase();
          if (status === 'connected' || status === 'pending' || status === 'error') {
            setStatusValue(status);
          }
          if (diagnostics.error_message) setStatusMessage(diagnostics.error_message);
        } catch {
          setStatusMessage((prev) => prev ?? 'Diagnóstico indisponível no momento. Use “Testar conexão” para atualizar o estado.');
        }
      } else {
        setHasConsumerKey(false);
        setHasConsumerSecret(false);
        setLastVerifiedAt(null);
        setStoreUrl('');
        setConfigDraft(toWooConfigDraft(null));
      }
    } catch (error: any) {
      addToast(error?.message || 'Falha ao carregar integração WooCommerce.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, addToast, connection?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSaveSecrets = useMemo(() => {
    return consumerKey.trim().length > 0 && consumerSecret.trim().length > 0;
  }, [consumerKey, consumerSecret]);

  const handleCreateConnection = async () => {
    if (!activeEmpresaId) return;
    setSaving(true);
    try {
      const created = await upsertEcommerceConnection({
        provider: 'woo',
        nome: 'WooCommerce',
        status: 'pending',
        config: {
          import_orders: true,
          sync_stock: false,
          sync_prices: false,
          push_tracking: false,
          safe_mode: true,
          sync_direction: 'bidirectional',
          conflict_policy: 'erp_wins',
          auto_sync_enabled: false,
          sync_interval_minutes: 15,
        },
      });
      setConnection(created);
      setConfigDraft(toWooConfigDraft(created));
      setStatusValue('pending');
      addToast('Conexão WooCommerce criada. Informe URL/credenciais e teste.', 'success');
      await load();
    } catch (error: any) {
      addToast(error?.message || 'Falha ao criar conexão WooCommerce.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!connection) return;
    const normalized = normalizeWooStoreUrl(storeUrl);
    if (!normalized.ok) {
      addToast(normalized.message, 'warning');
      return;
    }
    if (!canSaveSecrets) {
      addToast('Informe Consumer Key e Consumer Secret.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await setWooStoreUrl({ ecommerceId: connection.id, storeUrl: normalized.normalized });
      const saved = await setWooConnectionSecrets({
        ecommerceId: connection.id,
        consumerKey: consumerKey.trim(),
        consumerSecret: consumerSecret.trim(),
      });
      if (!saved.has_consumer_key || !saved.has_consumer_secret) {
        throw new Error('Backend não confirmou persistência das credenciais.');
      }
      setConsumerKey('');
      setConsumerSecret('');
      setHasConsumerKey(true);
      setHasConsumerSecret(true);
      setStatusValue(String(saved.connection_status ?? 'pending').toLowerCase());
      setLastVerifiedAt(saved.last_verified_at ?? null);
      setStatusMessage(saved.error_message ?? 'Credenciais salvas. Execute “Testar conexão” para validar.');
      addToast('Credenciais salvas com sucesso.', 'success');
      setTimeout(() => {
        void load();
      }, 450);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao salvar credenciais WooCommerce.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!connection) return;
    setSavingConfig(true);
    try {
      const mergedConfig = normalizeEcommerceConfig({
        ...(connection.config ?? DEFAULT_WOO_CONFIG),
        import_orders: configDraft.import_orders,
        sync_stock: configDraft.sync_stock,
        sync_prices: configDraft.sync_prices,
        auto_sync_enabled: configDraft.auto_sync_enabled,
        sync_interval_minutes: configDraft.sync_interval_minutes,
        price_percent_default: configDraft.price_percent_default,
      });
      await updateEcommerceConnectionConfig(connection.id, mergedConfig);
      setConnection((prev) => (prev ? { ...prev, config: mergedConfig } : prev));
      addToast('Configurações de sincronização salvas.', 'success');
    } catch (error: any) {
      addToast(error?.message || 'Falha ao salvar configurações de sincronização.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    if (!connection || !activeEmpresaId) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('woocommerce-test-connection', {
        headers: { 'x-empresa-id': activeEmpresaId },
        body: { ecommerce_id: connection.id },
      });
      if (error) {
        const bodyText = String((error as any)?.context?.body ?? '');
        const parsed = bodyText ? (() => { try { return JSON.parse(bodyText); } catch { return null; } })() : null;
        const message = String(parsed?.message ?? error.message ?? 'Falha ao testar conexão WooCommerce.');
        setStatusValue('error');
        setStatusMessage(message);
        setConnection((prev) => (prev ? { ...prev, status: 'error', last_error: message } : prev));
        addToast(message, 'error');
      } else {
        const payload = (data as any) ?? {};
        const status = String(payload.status ?? 'connected').toLowerCase();
        setStatusValue(status === 'pending' ? 'pending' : 'connected');
        setStatusMessage(String(payload.message ?? 'Conexão validada.'));
        setLastVerifiedAt(payload.last_verified_at ?? null);
        setConnection((prev) => (prev ? { ...prev, status: status === 'pending' ? 'pending' : 'connected', last_error: null } : prev));
        addToast(String(payload.message ?? 'Conexão validada com sucesso.'), status === 'pending' ? 'warning' : 'success');
      }
      setTimeout(() => {
        void load();
      }, 650);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao testar conexão WooCommerce.', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    setDisconnecting(true);
    try {
      await disconnectEcommerceConnection(connection.id);
      setConnection(null);
      setStatusValue('disconnected');
      setStatusMessage(null);
      setHasConsumerKey(false);
      setHasConsumerSecret(false);
      setLastVerifiedAt(null);
      addToast('Integração WooCommerce desconectada.', 'success');
      await load();
    } catch (error: any) {
      addToast(error?.message || 'Falha ao desconectar WooCommerce.', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Integrações</h1>
        <p className="text-sm text-gray-600 mt-1">Conecte/desconecte WooCommerce e valide conexão com diagnóstico classificado.</p>
      </div>

      <GlassCard className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-lg font-semibold text-gray-900">WooCommerce</div>
          {statusBadge(statusValue)}
        </div>

        {!activeEmpresaId ? (
          <div className="text-sm text-amber-700">Selecione uma empresa ativa para configurar a integração.</div>
        ) : loading ? (
          <div className="text-sm text-gray-600">Carregando integração…</div>
        ) : !connection ? (
          <Button onClick={() => void handleCreateConnection()} disabled={saving} className="gap-2">
            <Link2 size={16} />
            {saving ? 'Criando…' : 'Conectar WooCommerce'}
          </Button>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="URL da loja"
                value={storeUrl}
                placeholder="https://sualoja.com.br"
                onChange={(e) => setStoreUrl((e.target as HTMLInputElement).value)}
              />
              <div />
              <Input
                label="Consumer Key"
                value={consumerKey}
                type="password"
                placeholder={hasConsumerKey ? 'Salva (mascarada)' : 'ck_...'}
                onChange={(e) => setConsumerKey((e.target as HTMLInputElement).value)}
                helperText={hasConsumerKey && !consumerKey ? WOO_MASK : undefined}
              />
              <Input
                label="Consumer Secret"
                value={consumerSecret}
                type="password"
                placeholder={hasConsumerSecret ? 'Salva (mascarada)' : 'cs_...'}
                onChange={(e) => setConsumerSecret((e.target as HTMLInputElement).value)}
                helperText={hasConsumerSecret && !consumerSecret ? WOO_MASK : undefined}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${hasConsumerKey ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                <CheckCircle2 size={13} />
                {hasConsumerKey ? 'Consumer Key armazenada' : 'Consumer Key não armazenada'}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${hasConsumerSecret ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                <CheckCircle2 size={13} />
                {hasConsumerSecret ? 'Consumer Secret armazenada' : 'Consumer Secret não armazenada'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleSaveCredentials()} disabled={saving || !canSaveSecrets}>
                {saving ? 'Salvando…' : 'Salvar credenciais'}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => void handleTestConnection()} disabled={testing}>
                <RefreshCw size={16} className={testing ? 'animate-spin' : ''} />
                {testing ? 'Testando…' : 'Testar conexão'}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => void handleDisconnect()} disabled={disconnecting}>
                <Unlink size={16} />
                {disconnecting ? 'Desconectando…' : 'Desconectar'}
              </Button>
              <Button asChild variant="ghost">
                <Link to="/app/desenvolvedor/saude">Ver monitor de saúde</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/app/desenvolvedor/woocommerce">Abrir painel WooCommerce</Link>
              </Button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
              <div className="text-sm font-medium text-slate-800">Sincronização</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm text-slate-700">Importar pedidos</span>
                  <Switch
                    checked={configDraft.import_orders}
                    onCheckedChange={(checked) => setConfigDraft((prev) => ({ ...prev, import_orders: checked }))}
                  />
                </label>
                <label className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm text-slate-700">Sincronizar estoque</span>
                  <Switch
                    checked={configDraft.sync_stock}
                    onCheckedChange={(checked) => setConfigDraft((prev) => ({ ...prev, sync_stock: checked }))}
                  />
                </label>
                <label className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm text-slate-700">Sincronizar preços</span>
                  <Switch
                    checked={configDraft.sync_prices}
                    onCheckedChange={(checked) => setConfigDraft((prev) => ({ ...prev, sync_prices: checked }))}
                  />
                </label>
                <label className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm text-slate-700">Sincronização automática</span>
                  <Switch
                    checked={configDraft.auto_sync_enabled}
                    onCheckedChange={(checked) => setConfigDraft((prev) => ({ ...prev, auto_sync_enabled: checked }))}
                  />
                </label>
                <Input
                  label="Intervalo (minutos)"
                  type="number"
                  min={5}
                  max={1440}
                  value={String(configDraft.sync_interval_minutes)}
                  onChange={(e) =>
                    setConfigDraft((prev) => ({
                      ...prev,
                      sync_interval_minutes: Math.max(5, Math.min(1440, Number((e.target as HTMLInputElement).value || 15))),
                    }))
                  }
                />
                <Input
                  label="Margem padrão (%)"
                  type="number"
                  step="0.01"
                  value={String(configDraft.price_percent_default)}
                  onChange={(e) =>
                    setConfigDraft((prev) => ({
                      ...prev,
                      price_percent_default: Number((e.target as HTMLInputElement).value || 0),
                    }))
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => void handleSaveConfig()} disabled={savingConfig}>
                  {savingConfig ? 'Salvando configurações…' : 'Salvar configurações de sync'}
                </Button>
              </div>
            </div>

            {lastVerifiedAt ? (
              <div className="text-xs text-gray-500">Última verificação: {new Date(lastVerifiedAt).toLocaleString('pt-BR')}</div>
            ) : null}
            {statusMessage ? (
              <div className="inline-flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                <AlertTriangle size={14} className="mt-[1px]" />
                <span>{statusMessage}</span>
              </div>
            ) : null}
          </>
        )}
      </GlassCard>
    </div>
  );
}
