import { normalizeWooStoreUrl } from '@/lib/ecommerce/wooStoreUrl';

export type WooStoreOption = { id: string; base_url: string; status?: string | null };

export function normalizeWooBaseUrl(value: string): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = normalizeWooStoreUrl(raw);
  return normalized.ok ? normalized.normalized : null;
}

export function selectPreferredWooStoreId(params: {
  stores: WooStoreOption[];
  preferredStoreUrl?: string | null;
}): string {
  const preferred = normalizeWooBaseUrl(String(params.preferredStoreUrl ?? '').trim());
  const stores = Array.isArray(params.stores) ? params.stores : [];
  if (preferred) {
    const match = stores.find((store) => normalizeWooBaseUrl(store.base_url) === preferred);
    if (match?.id) return String(match.id);
  }

  const firstActive = stores.find((store) => String(store.status ?? '').toLowerCase() === 'active');
  if (firstActive?.id) return String(firstActive.id);

  return stores[0]?.id ? String(stores[0].id) : '';
}

