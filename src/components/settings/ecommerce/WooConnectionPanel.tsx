import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Link2, RefreshCw, Unlink } from 'lucide-react';
import { Link } from 'react-router-dom';

import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { supabase } from '@/lib/supabaseClient';
import { normalizeWooStoreUrl } from '@/lib/ecommerce/wooStoreUrl';
import {
  disconnectEcommerceConnection,
  getEcommerceConnectionDiagnostics,
  listEcommerceConnections,
  setWooConnectionSecrets,
  setWooStoreUrl,
  upsertEcommerceConnection,
  type EcommerceConnection,
} from '@/services/ecommerceIntegrations';

const WOO_MASK = '••••••••••••••••';

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
  const [connection, setConnection] = useState<EcommerceConnection | null>(null);
  const [storeUrl, setStoreUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
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
      const woo = rows.find((row) => row.provider === 'woo') ?? null;
      setConnection(woo);
      setStoreUrl(String(woo?.config?.store_url ?? ''));
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
          setHasConsumerKey(false);
          setHasConsumerSecret(false);
          setLastVerifiedAt(null);
        }
      } else {
        setHasConsumerKey(false);
        setHasConsumerSecret(false);
        setLastVerifiedAt(null);
      }
    } catch (error: any) {
      addToast(error?.message || 'Falha ao carregar integração WooCommerce.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, addToast]);

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
      setStatusValue('pending');
      setStatusMessage('Credenciais salvas. Execute “Testar conexão” para validar.');
      addToast('Credenciais salvas com sucesso.', 'success');
      await load();
    } catch (error: any) {
      addToast(error?.message || 'Falha ao salvar credenciais WooCommerce.', 'error');
    } finally {
      setSaving(false);
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
        addToast(message, 'error');
      } else {
        const payload = (data as any) ?? {};
        const status = String(payload.status ?? 'connected').toLowerCase();
        setStatusValue(status === 'pending' ? 'pending' : 'connected');
        setStatusMessage(String(payload.message ?? 'Conexão validada.'));
        setLastVerifiedAt(payload.last_verified_at ?? null);
        addToast(String(payload.message ?? 'Conexão validada com sucesso.'), status === 'pending' ? 'warning' : 'success');
      }
      await load();
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
