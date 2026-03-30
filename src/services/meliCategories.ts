import { callRpc } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeliCategoryCacheRow = {
  id: string;
  name: string;
  parent_id: string | null;
  path_from_root: { id: string; name: string }[];
  has_children: boolean;
  picture: string | null;
  fetched_at: string;
};

export type MeliCategoryMapping = {
  id: string;
  grupo_id: string | null;
  grupo_nome: string | null;
  meli_category_id: string;
  meli_category_name: string | null;
  meli_category_path: string | null;
};

export type MeliListingAttribute = {
  attribute_id: string;
  attribute_name: string | null;
  value_id: string | null;
  value_name: string;
};

export type MeliWebhookEvent = {
  id: string;
  ecommerce_id: string;
  notification_id: string | null;
  topic: string;
  resource: string | null;
  process_status: string;
  processed_at: string | null;
  last_error: string | null;
  received_at: string;
};

export type MeliHealthSummary = {
  total_anuncios: number;
  synced: number;
  pending: number;
  error: number;
  last_sync_at: string | null;
  active_connections: number;
};

// ---------------------------------------------------------------------------
// Category cache (RPC-based)
// ---------------------------------------------------------------------------

export async function searchMeliCategoriesLocal(query?: string, limit = 20): Promise<MeliCategoryCacheRow[]> {
  return callRpc<MeliCategoryCacheRow[]>('meli_categories_search', {
    p_query: query || null,
    p_limit: limit,
  });
}

export async function getMeliCategoryFromCache(categoryId: string): Promise<MeliCategoryCacheRow | null> {
  const result = await callRpc<any>('meli_category_get', {
    p_category_id: categoryId,
  });
  if (!result || typeof result !== 'object') return null;
  return result as MeliCategoryCacheRow;
}

// ---------------------------------------------------------------------------
// Category mappings (grupo → ML category)
// ---------------------------------------------------------------------------

export async function listMeliCategoryMappings(): Promise<MeliCategoryMapping[]> {
  return callRpc<MeliCategoryMapping[]>('meli_category_mappings_list', {});
}

export async function upsertMeliCategoryMapping(params: {
  grupoId: string;
  meliCategoryId: string;
  meliName: string;
  meliPath: string;
}): Promise<void> {
  await callRpc('meli_category_mapping_upsert', {
    p_grupo_id: params.grupoId,
    p_meli_category_id: params.meliCategoryId,
    p_meli_name: params.meliName,
    p_meli_path: params.meliPath,
  });
}

export async function deleteMeliCategoryMapping(mappingId: string): Promise<void> {
  await callRpc('meli_category_mapping_delete', {
    p_mapping_id: mappingId,
  });
}

// ---------------------------------------------------------------------------
// Listing attributes (per-anuncio ML attributes)
// ---------------------------------------------------------------------------

export async function listMeliListingAttributes(anuncioId: string): Promise<MeliListingAttribute[]> {
  return callRpc<MeliListingAttribute[]>('meli_listing_attributes_list', {
    p_produto_anuncio_id: anuncioId,
  });
}

export async function upsertMeliListingAttributes(
  anuncioId: string,
  attributes: { attribute_id: string; attribute_name?: string; value_id?: string; value_name: string }[],
): Promise<void> {
  await callRpc('meli_listing_attributes_upsert', {
    p_produto_anuncio_id: anuncioId,
    p_attributes: attributes,
  });
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

export async function listMeliWebhookEvents(
  ecommerceId: string,
  status?: string,
  limit = 50,
): Promise<MeliWebhookEvent[]> {
  return callRpc<MeliWebhookEvent[]>('meli_webhook_events_list', {
    p_ecommerce_id: ecommerceId,
    p_status: status || null,
    p_limit: limit,
  });
}

// ---------------------------------------------------------------------------
// Health summary
// ---------------------------------------------------------------------------

export async function getMeliHealthSummary(): Promise<MeliHealthSummary> {
  return callRpc<MeliHealthSummary>('meli_health_summary', {});
}
