import { supabase } from '@/lib/supabaseClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MeliAdminAction =
  // Account
  | 'account.info'
  // Categories
  | 'categories.search'
  | 'categories.tree'
  | 'categories.detail'
  | 'categories.predict'
  | 'categories.cache_refresh'
  // Listings
  | 'listings.validate'
  | 'listings.create'
  | 'listings.update'
  | 'listings.pause'
  | 'listings.activate'
  | 'listings.close'
  | 'listings.get'
  | 'listings.description.set'
  // Sync
  | 'sync.stock'
  | 'sync.price'
  | 'sync.stock.batch'
  | 'sync.price.batch'
  // Questions
  | 'questions.list'
  | 'questions.answer'
  // Health
  | 'health.check';

export type MeliAccountInfo = {
  id: number;
  nickname: string;
  first_name: string;
  last_name: string;
  email: string;
  site_id: string;
  seller_reputation?: {
    level_id: string;
    power_seller_status: string | null;
    transactions?: { total: number; completed: number; canceled: number };
  };
};

export type MeliCategorySearchResult = {
  id: string;
  name: string;
  path_from_root: { id: string; name: string }[];
};

export type MeliCategoryTree = {
  id: string;
  name: string;
  children_categories: { id: string; name: string; total_items_in_this_category: number }[];
};

export type MeliCategoryDetail = {
  id: string;
  name: string;
  path_from_root: { id: string; name: string }[];
  children_categories: { id: string; name: string }[];
  attributes: MeliCategoryAttribute[];
};

export type MeliCategoryAttribute = {
  id: string;
  name: string;
  value_type: 'string' | 'number' | 'number_unit' | 'list' | 'boolean' | 'grid';
  tags: Record<string, unknown>;
  values: { id: string; name: string }[];
  allowed_units?: { id: string; name: string }[];
  required?: boolean;
};

export type MeliCategoryPrediction = {
  id: string;
  name: string;
  path_from_root: { id: string; name: string }[];
  prediction_probability: number;
};

export type MeliListingValidation = {
  ok: true;
  valid: boolean;
  blockers: string[];
  warnings: string[];
  payload_preview: Record<string, unknown>;
};

export type MeliListingCreateResult = {
  ok: true;
  meli_item_id: string;
  permalink: string;
  anuncio_id: string;
};

export type MeliListingGetResult = {
  ok: true;
  item: Record<string, unknown>;
};

export type MeliSyncResult = {
  ok: true;
  meli_item_id: string;
  updated_fields: string[];
};

export type MeliBatchSyncResult = {
  ok: true;
  results: { anuncio_id: string; meli_item_id: string; success: boolean; error?: string }[];
  summary: { success: number; error: number };
};

export type MeliQuestion = {
  id: number;
  item_id: string;
  text: string;
  status: string;
  date_created: string;
  from: { id: number; nickname?: string };
  answer?: { text: string; date_created: string };
};

export type MeliHealthCheck = {
  ok: true;
  account_ok: boolean;
  token_ok: boolean;
  token_expires_at: string | null;
  listings_active: number;
  listings_paused: number;
  listings_error: number;
  last_sync_at: string | null;
  pending_questions: number;
};

// ---------------------------------------------------------------------------
// Invoke helper (same pattern as woocommerceCatalog.ts)
// ---------------------------------------------------------------------------

function sanitizeError(error: unknown): string {
  return String(error ?? 'Falha ao processar integração Mercado Livre.').slice(0, 500);
}

async function invoke<T>(action: MeliAdminAction, params: {
  empresaId: string;
  ecommerceId: string;
  payload?: Record<string, unknown>;
}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('meli-admin', {
    body: {
      action,
      ecommerce_id: params.ecommerceId,
      ...(params.payload ?? {}),
    },
    headers: {
      'x-empresa-id': params.empresaId,
    },
  });
  if (error) throw new Error(sanitizeError(error.message));
  if (!(data as any)?.ok) {
    const message = String((data as any)?.error ?? 'Ação Mercado Livre não concluída.');
    const hint = (data as any)?.hint ? ` (${String((data as any)?.hint)})` : '';
    throw new Error(`${message}${hint}`.slice(0, 500));
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export function getMeliAccountInfo(empresaId: string, ecommerceId: string) {
  return invoke<{ ok: true; user: MeliAccountInfo }>('account.info', {
    empresaId,
    ecommerceId,
  });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function searchMeliCategories(empresaId: string, ecommerceId: string, query: string) {
  return invoke<{ ok: true; results: MeliCategorySearchResult[] }>('categories.search', {
    empresaId,
    ecommerceId,
    payload: { query },
  });
}

export function getMeliCategoryTree(empresaId: string, ecommerceId: string) {
  return invoke<{ ok: true; categories: MeliCategoryTree[] }>('categories.tree', {
    empresaId,
    ecommerceId,
  });
}

export function getMeliCategoryDetail(empresaId: string, ecommerceId: string, categoryId: string) {
  return invoke<{ ok: true; category: MeliCategoryDetail }>('categories.detail', {
    empresaId,
    ecommerceId,
    payload: { category_id: categoryId },
  });
}

export function predictMeliCategory(empresaId: string, ecommerceId: string, title: string) {
  return invoke<{ ok: true; predictions: MeliCategoryPrediction[] }>('categories.predict', {
    empresaId,
    ecommerceId,
    payload: { title },
  });
}

export function refreshMeliCategoriesCache(empresaId: string, ecommerceId: string) {
  return invoke<{ ok: true; cached: number }>('categories.cache_refresh', {
    empresaId,
    ecommerceId,
  });
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export function validateMeliListing(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<MeliListingValidation>('listings.validate', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function createMeliListing(empresaId: string, ecommerceId: string, anuncioId: string, options?: {
  listing_type_id?: string;
}) {
  return invoke<MeliListingCreateResult>('listings.create', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId, ...options },
  });
}

export function updateMeliListing(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<{ ok: true; meli_item_id: string }>('listings.update', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function pauseMeliListing(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<{ ok: true; meli_item_id: string }>('listings.pause', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function activateMeliListing(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<{ ok: true; meli_item_id: string }>('listings.activate', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function closeMeliListing(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<{ ok: true; meli_item_id: string }>('listings.close', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function getMeliListing(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<MeliListingGetResult>('listings.get', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function setMeliListingDescription(empresaId: string, ecommerceId: string, anuncioId: string, description: string) {
  return invoke<{ ok: true; meli_item_id: string }>('listings.description.set', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId, description },
  });
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export function syncMeliStock(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<MeliSyncResult>('sync.stock', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function syncMeliPrice(empresaId: string, ecommerceId: string, anuncioId: string) {
  return invoke<MeliSyncResult>('sync.price', {
    empresaId,
    ecommerceId,
    payload: { anuncio_id: anuncioId },
  });
}

export function batchSyncMeliStock(empresaId: string, ecommerceId: string, anuncioIds: string[]) {
  return invoke<MeliBatchSyncResult>('sync.stock.batch', {
    empresaId,
    ecommerceId,
    payload: { anuncio_ids: anuncioIds },
  });
}

export function batchSyncMeliPrice(empresaId: string, ecommerceId: string, anuncioIds: string[]) {
  return invoke<MeliBatchSyncResult>('sync.price.batch', {
    empresaId,
    ecommerceId,
    payload: { anuncio_ids: anuncioIds },
  });
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export function listMeliQuestions(empresaId: string, ecommerceId: string) {
  return invoke<{ ok: true; questions: MeliQuestion[] }>('questions.list', {
    empresaId,
    ecommerceId,
  });
}

export function answerMeliQuestion(empresaId: string, ecommerceId: string, questionId: number, text: string) {
  return invoke<{ ok: true; question_id: number }>('questions.answer', {
    empresaId,
    ecommerceId,
    payload: { question_id: questionId, text },
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export function getMeliHealthCheck(empresaId: string, ecommerceId: string) {
  return invoke<MeliHealthCheck>('health.check', {
    empresaId,
    ecommerceId,
  });
}
