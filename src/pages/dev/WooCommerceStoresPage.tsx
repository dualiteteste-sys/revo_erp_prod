import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, RefreshCw, Store } from 'lucide-react';

import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { normalizeWooBaseUrl, pickPreferredEcommerceConnection } from '@/lib/ecommerce/wooConnectionState';
import { listEcommerceConnections } from '@/services/ecommerceIntegrations';
import { listWooStores, type WooStore } from '@/services/woocommerceControlPanel';

function statusBadge(status?: string | null) {
  const raw = String(status ?? '').toLowerCase();
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold';
  if (raw === 'active') return <span className={`${base} bg-emerald-100 text-emerald-700`}>Ativa</span>;
  if (raw === 'paused') return <span className={`${base} bg-amber-100 text-amber-800`}>Pausada</span>;
  if (raw === 'error') return <span className={`${base} bg-red-100 text-red-700`}>Erro</span>;
  return <span className={`${base} bg-slate-100 text-slate-700`}>{status || '—'}</span>;
}

export default function WooCommerceStoresPage() {
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<WooStore[]>([]);
  const [preferredBaseUrl, setPreferredBaseUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeEmpresaId) {
      setStores([]);
      setPreferredBaseUrl(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [storesRows, connectionsRows] = await Promise.all([
        listWooStores(activeEmpresaId),
        listEcommerceConnections(),
      ]);

      const preferredWooConnection = pickPreferredEcommerceConnection(connectionsRows, 'woo');
      const preferredWooUrl = String(preferredWooConnection?.config?.store_url ?? '').trim();
      setPreferredBaseUrl(normalizeWooBaseUrl(preferredWooUrl));
      setStores(storesRows);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao carregar lojas WooCommerce.', 'error');
      setStores([]);
      setPreferredBaseUrl(null);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="WooCommerce — Lojas"
        description="Lista interna de lojas Woo para diagnóstico e operação."
        icon={<Store className="h-5 w-5" />}
        actions={(
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        )}
      />

      {!activeEmpresaId && (
        <GlassCard className="p-4 text-sm text-amber-700">
          Selecione uma empresa ativa para carregar as lojas.
        </GlassCard>
      )}

      {activeEmpresaId && !loading && stores.length === 0 && (
        <GlassCard className="p-6 text-sm text-slate-600">
          <p>Nenhuma loja WooCommerce cadastrada para a empresa ativa.</p>
          {preferredBaseUrl && (
            <p className="mt-2 text-xs text-slate-500">
              Existe uma URL de loja preferida configurada (<span className="font-medium">{preferredBaseUrl}</span>), mas ela ainda não foi materializada
              como loja interna. Clique em <span className="font-medium">Atualizar</span> para forçar a sincronização da loja.
            </p>
          )}
          <div className="mt-4">
            <Button asChild size="sm" variant="outline">
              <Link to="/app/configuracoes/ecommerce/marketplaces">
                Abrir configurações
              </Link>
            </Button>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {stores.map((store) => (
          <GlassCard key={store.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {store.base_url}
                  {preferredBaseUrl && normalizeWooBaseUrl(store.base_url) === preferredBaseUrl && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      Preferida
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">{store.id}</p>
              </div>
              {statusBadge(store.status)}
            </div>
            <div className="text-xs text-slate-500">
              Auth: <span className="font-medium text-slate-700">{store.auth_mode}</span>
            </div>
            <div className="flex justify-end">
              <Button asChild size="sm">
                <Link to={`/app/desenvolvedor/woocommerce/${store.id}`}>
                  Abrir painel
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
