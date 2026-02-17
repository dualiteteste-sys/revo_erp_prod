import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { listWooStores } from '@/services/woocommerceControlPanel';
import { getWooListingByProduct, linkWooListingBySku, unlinkWooListing } from '@/services/woocommerceCatalog';
import { forceWooPriceSync, forceWooStockSync } from '@/services/woocommerceControlPanel';
import type { ProductFormData } from '@/components/products/ProductFormPanel';
import { Button } from '@/components/ui/button';
import { listEcommerceConnections } from '@/services/ecommerceIntegrations';
import { pickPreferredEcommerceConnection } from '@/lib/ecommerce/wooConnectionState';
import { selectPreferredWooStoreId } from '@/lib/ecommerce/wooStoreSelection';

type Props = {
  data: ProductFormData;
};

export default function WooCommerceChannelTab({ data }: Props) {
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<Array<{ id: string; base_url: string; status: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [listing, setListing] = useState<any>(null);
  const [skuInput, setSkuInput] = useState(String(data.sku ?? '').trim());

  useEffect(() => {
    setSkuInput(String(data.sku ?? '').trim());
  }, [data.sku]);

  useEffect(() => {
    if (!activeEmpresaId) {
      setStores([]);
      setStoreId('');
      return;
    }

    setLoading(true);
    void (async () => {
      try {
        const [rows, connections] = await Promise.all([
          listWooStores(activeEmpresaId),
          listEcommerceConnections(),
        ]);
        setStores(rows as any);
        const preferred = pickPreferredEcommerceConnection(connections, 'woo');
        const preferredUrl = String(preferred?.config?.store_url ?? '').trim() || null;
        const nextId = selectPreferredWooStoreId({
          stores: rows as any,
          preferredStoreUrl: preferredUrl,
        });
        setStoreId((current) => {
          if (current && (rows as any[]).some((s) => String((s as any)?.id) === String(current))) return current;
          return nextId;
        });
      } catch (error: any) {
        addToast(error?.message || 'Falha ao carregar lojas Woo.', 'error');
        setStores([]);
        setStoreId('');
      } finally {
        setLoading(false);
      }
    })();
  }, [activeEmpresaId, addToast]);

  const canUse = !!activeEmpresaId && !!storeId && !!data.id;

  const refresh = async () => {
    if (!canUse) return;
    setLoading(true);
    try {
      const response = await getWooListingByProduct({
        empresaId: activeEmpresaId!,
        storeId,
        revoProductId: String(data.id),
      });
      setListing(response.listing ?? null);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao consultar vínculo Woo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [activeEmpresaId, storeId, data.id]);

  const listingStatusLabel = useMemo(() => {
    const status = String(listing?.listing_status ?? '').trim();
    if (status === 'linked') return 'Vinculado';
    if (status === 'conflict') return 'Conflito';
    if (status === 'error') return 'Erro';
    return 'Não vinculado';
  }, [listing?.listing_status]);

  const onLink = async () => {
    if (!canUse) return;
    if (!skuInput) {
      addToast('Informe um SKU para vincular.', 'warning');
      return;
    }
    setLoading(true);
    try {
      await linkWooListingBySku({
        empresaId: activeEmpresaId!,
        storeId,
        revoProductId: String(data.id),
        sku: skuInput,
      });
      addToast('Vínculo realizado com sucesso.', 'success');
      await refresh();
    } catch (error: any) {
      addToast(error?.message || 'Falha ao vincular SKU no Woo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onUnlink = async () => {
    if (!canUse) return;
    setLoading(true);
    try {
      await unlinkWooListing({
        empresaId: activeEmpresaId!,
        storeId,
        revoProductId: String(data.id),
      });
      addToast('Vínculo removido.', 'success');
      await refresh();
    } catch (error: any) {
      addToast(error?.message || 'Falha ao desvincular produto.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const syncSingle = async (type: 'price' | 'stock') => {
    if (!canUse) return;
    if (!skuInput) {
      addToast('Produto sem SKU. Não é possível sincronizar.', 'warning');
      return;
    }
    setLoading(true);
    try {
      if (type === 'price') {
        await forceWooPriceSync(activeEmpresaId!, storeId, [skuInput]);
      } else {
        await forceWooStockSync(activeEmpresaId!, storeId, [skuInput]);
      }
      addToast(type === 'price' ? 'Sincronização de preço enfileirada.' : 'Sincronização de estoque enfileirada.', 'success');
      await refresh();
    } catch (error: any) {
      addToast(error?.message || 'Falha ao sincronizar item.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!data.id) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Salve o produto para habilitar o canal WooCommerce.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Loja Woo</label>
          <select
            value={storeId}
            onChange={(event) => setStoreId(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Selecione</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.base_url} ({store.status})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">SKU para vínculo</label>
          <input
            value={skuInput}
            onChange={(event) => setSkuInput(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ex.: SKU-001"
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <div className="mb-2 font-semibold text-slate-800">Status do anúncio</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>Status: <span className="font-semibold">{listingStatusLabel}</span></div>
          <div>Woo ID: <span className="font-mono">{listing?.woo_product_id ?? '-'}</span></div>
          <div>Variação: <span className="font-mono">{listing?.woo_variation_id ?? '-'}</span></div>
          <div>Último preço: {listing?.last_sync_price_at ?? '-'}</div>
          <div>Último estoque: {listing?.last_sync_stock_at ?? '-'}</div>
          <div>Erro: {listing?.last_error_code ?? '-'}</div>
        </div>
        {listing?.last_error_hint ? (
          <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
            {listing.last_error_hint}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading || !canUse} className="gap-2">
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
        <Button variant="secondary" onClick={() => void onLink()} disabled={loading || !canUse} className="gap-2">
          Vincular por SKU
        </Button>
        <Button variant="secondary" onClick={() => void onUnlink()} disabled={loading || !canUse} className="gap-2">
          Desvincular
        </Button>
        <Button onClick={() => void syncSingle('price')} disabled={loading || !canUse}>Sincronizar preço</Button>
        <Button onClick={() => void syncSingle('stock')} disabled={loading || !canUse}>Sincronizar estoque</Button>
      </div>
    </div>
  );
}
