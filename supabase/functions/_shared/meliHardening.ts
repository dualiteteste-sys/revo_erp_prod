/**
 * Mercado Livre — shared hardening utilities
 * Used by meli-admin, meli-worker, meli-webhook, meli-scheduler, marketplaces-sync
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MELI_API_BASE = "https://api.mercadolibre.com";
export const MELI_SITE_ID = "MLB"; // Brasil

export const MELI_LISTING_TYPES = ["free", "gold_special", "gold_pro", "gold_premium"] as const;
export type MeliListingType = (typeof MELI_LISTING_TYPES)[number];

export const MELI_BUYING_MODES = ["buy_it_now", "auction"] as const;

// Rate limits per ML docs (approximate, conservative)
export const MELI_RATE_LIMITS = {
  search:   { limit: 30, windowSeconds: 60 },
  read:     { limit: 50, windowSeconds: 60 },
  write:    { limit: 10, windowSeconds: 60 },
  pictures: { limit: 10, windowSeconds: 60 },
} as const;

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

export function buildMeliUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path.startsWith("http") ? path : `${MELI_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// HTTP fetch helpers (with token)
// ---------------------------------------------------------------------------

export async function meliFetchJson(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: any }> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "UltriaERP/meli-admin",
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

export async function meliPostJson(
  url: string,
  accessToken: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: any }> {
  return meliFetchJson(url, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function meliPutJson(
  url: string,
  accessToken: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: any }> {
  return meliFetchJson(url, accessToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

export async function refreshMeliToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ ok: boolean; status: number; data: any }> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", params.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("refresh_token", params.refreshToken);
  const resp = await fetch(`${MELI_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export function classifyMeliHttpStatus(status: number): {
  code: string;
  retryable: boolean;
  hint: string;
} {
  if (status === 200 || status === 201) return { code: "OK", retryable: false, hint: "Success" };
  if (status === 400) return { code: "BAD_REQUEST", retryable: false, hint: "Payload inválido. Verifique campos obrigatórios." };
  if (status === 401) return { code: "UNAUTHORIZED", retryable: true, hint: "Token expirado. Refresh automático será tentado." };
  if (status === 403) return { code: "FORBIDDEN", retryable: false, hint: "Sem permissão para esta ação no ML." };
  if (status === 404) return { code: "NOT_FOUND", retryable: false, hint: "Recurso não encontrado no ML." };
  if (status === 429) return { code: "RATE_LIMITED", retryable: true, hint: "Limite de requisições excedido. Tente novamente em breve." };
  if (status >= 500) return { code: "ML_SERVER_ERROR", retryable: true, hint: "Erro interno do Mercado Livre. Será retentado." };
  return { code: `HTTP_${status}`, retryable: false, hint: `Status HTTP ${status} inesperado.` };
}

// ---------------------------------------------------------------------------
// Condition mapping
// ---------------------------------------------------------------------------

export function mapMeliCondition(condicao: string): "new" | "used" | "not_specified" {
  const c = (condicao ?? "").toLowerCase().trim();
  if (c === "novo" || c === "new") return "new";
  if (c === "usado" || c === "used") return "used";
  if (c === "recondicionado" || c === "refurbished") return "used";
  return "not_specified";
}

// ---------------------------------------------------------------------------
// Title validation (ML rules: 20-60 chars, no HTML, no ALL CAPS for >3 words)
// ---------------------------------------------------------------------------

export function validateMeliTitle(title: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const t = (title ?? "").trim();
  if (!t) {
    errors.push("Título é obrigatório.");
    return { valid: false, errors };
  }
  if (t.length < 10) errors.push(`Título muito curto (${t.length} chars). Mínimo: 10.`);
  if (t.length > 60) errors.push(`Título muito longo (${t.length} chars). Máximo: 60.`);
  if (/<[^>]+>/.test(t)) errors.push("Título não pode conter HTML.");
  // ML rejects ALL CAPS titles with more than 3 words
  const words = t.split(/\s+/);
  if (words.length > 3 && t === t.toUpperCase()) {
    errors.push("Título não pode ser todo em MAIÚSCULAS (com mais de 3 palavras).");
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Payload builder: Revo product → ML item
// ---------------------------------------------------------------------------

export interface MeliItemPayload {
  title: string;
  category_id: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  buying_mode: string;
  condition: "new" | "used" | "not_specified";
  listing_type_id: string;
  pictures: { source: string }[];
  attributes: { id: string; value_name: string; value_id?: string }[];
  description?: { plain_text: string };
  video_id?: string;
  sale_terms?: { id: string; value_name: string }[];
}

export function meliItemFromRevo(params: {
  product: any;
  listing: any;
  images: { url: string; principal?: boolean }[];
  attributes: { attribute_id: string; attribute_name: string; value_id?: string; value_name: string }[];
  brand?: string | null;
  categoryId: string;
  listingType?: string;
}): MeliItemPayload {
  const { product, listing, images, attributes, brand, categoryId, listingType } = params;

  const title = (listing.titulo || product.nome || "").trim().slice(0, 60);
  const price = listing.preco_especifico ?? product.preco_promocional ?? product.preco_venda ?? 0;
  const quantity = Math.max(0, Math.trunc(Number(product.estoque_disponivel ?? product.estoque_atual ?? 0)));

  // Sort images: principal first
  const sortedImages = [...images].sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0));
  const pictures = sortedImages
    .filter((img) => img.url)
    .slice(0, 10) // ML max 10 pictures
    .map((img) => ({ source: img.url }));

  // Build attributes array
  const attrs: MeliItemPayload["attributes"] = [];

  // Auto-inject brand if available
  if (brand && !attributes.find((a) => a.attribute_id === "BRAND")) {
    attrs.push({ id: "BRAND", value_name: brand });
  }

  // Auto-inject model if available
  if (product.modelo && !attributes.find((a) => a.attribute_id === "MODEL")) {
    attrs.push({ id: "MODEL", value_name: product.modelo });
  }

  // Auto-inject GTIN/EAN if available
  if (product.gtin && !attributes.find((a) => a.attribute_id === "GTIN")) {
    attrs.push({ id: "GTIN", value_name: product.gtin });
  }

  // User-defined attributes
  for (const attr of attributes) {
    if (!attrs.find((a) => a.id === attr.attribute_id)) {
      attrs.push({
        id: attr.attribute_id,
        value_name: attr.value_name,
        ...(attr.value_id ? { value_id: attr.value_id } : {}),
      });
    }
  }

  const description = listing.descricao || product.descricao || product.descricao_complementar || "";

  return {
    title,
    category_id: categoryId,
    price: Number(price),
    currency_id: "BRL",
    available_quantity: quantity,
    buying_mode: "buy_it_now",
    condition: mapMeliCondition(product.condicao || "novo"),
    listing_type_id: listing.meli_listing_type_id || listingType || "gold_special",
    pictures,
    attributes: attrs,
    ...(description ? { description: { plain_text: description.slice(0, 50000) } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

export function validateMeliPayload(payload: MeliItemPayload): {
  valid: boolean;
  blockers: string[];
  warnings: string[];
} {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const titleValidation = validateMeliTitle(payload.title);
  blockers.push(...titleValidation.errors);

  if (!payload.category_id) blockers.push("Categoria do Mercado Livre é obrigatória.");
  if (!payload.price || payload.price <= 0) blockers.push("Preço deve ser maior que zero.");
  if (payload.available_quantity < 1) blockers.push("Estoque deve ser pelo menos 1.");
  if (!payload.pictures || payload.pictures.length === 0) blockers.push("Pelo menos 1 imagem é obrigatória.");
  if (payload.condition === "not_specified") warnings.push("Condição do produto não definida. ML pode rejeitar.");

  if (payload.pictures.length < 3) warnings.push("Recomendamos pelo menos 3 imagens para melhor conversão.");
  if (payload.pictures.length > 10) blockers.push("Máximo de 10 imagens permitido no ML.");

  if (!payload.listing_type_id || !MELI_LISTING_TYPES.includes(payload.listing_type_id as MeliListingType)) {
    warnings.push(`Tipo de listagem "${payload.listing_type_id}" pode não ser válido.`);
  }

  return { valid: blockers.length === 0, blockers, warnings };
}

// ---------------------------------------------------------------------------
// Exponential backoff with jitter
// ---------------------------------------------------------------------------

export function backoffMs(attempt: number, baseMs = 1000, maxMs = 60000): number {
  const exp = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = Math.random() * exp * 0.3;
  return Math.round(exp + jitter);
}
