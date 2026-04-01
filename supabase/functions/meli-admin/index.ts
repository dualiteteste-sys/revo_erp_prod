import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { hasPermissionOrOwnerAdmin } from "../_shared/rbac.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { getRequestId } from "../_shared/request.ts";
import { finopsTrackUsage } from "../_shared/finops.ts";
import {
  MELI_API_BASE,
  MELI_SITE_ID,
  buildMeliUrl,
  meliFetchJson,
  meliPostJson,
  meliPutJson,
  refreshMeliToken,
  classifyMeliHttpStatus,
  meliItemFromRevo,
  validateMeliPayload,
  backoffMs,
} from "../_shared/meliHardening.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MELI_CLIENT_ID = (Deno.env.get("MELI_CLIENT_ID") ?? "").trim();
const MELI_CLIENT_SECRET = (Deno.env.get("MELI_CLIENT_SECRET") ?? "").trim();

type Action =
  | "account.info"
  | "categories.search"
  | "categories.tree"
  | "categories.detail"
  | "categories.predict"
  | "categories.cache_refresh"
  | "listings.validate"
  | "listings.create"
  | "listings.update"
  | "listings.pause"
  | "listings.activate"
  | "listings.close"
  | "listings.get"
  | "listings.description.set"
  | "sync.stock"
  | "sync.price"
  | "sync.stock.batch"
  | "sync.price.batch"
  | "questions.list"
  | "questions.answer"
  | "health.check";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

async function resolveEmpresaId(params: { baseUser: any; svc: any; callerId: string; req: Request }): Promise<string> {
  const header = (params.req.headers.get("x-empresa-id") ?? "").trim();
  const { data: activeData } = await params.baseUser.rpc("active_empresa_get_for_current_user", {});
  const candidate = header || String(activeData ?? "").trim();
  if (!candidate) throw new Error("EMPRESA_ID_REQUIRED");

  const { data: memberships } = await params.svc
    .from("empresa_usuarios")
    .select("empresa_id")
    .eq("user_id", params.callerId)
    .limit(50);
  const userEmpresaIds = (Array.isArray(memberships) ? memberships : []).map((row: any) => String(row?.empresa_id ?? ""));
  if (!userEmpresaIds.includes(candidate)) throw new Error("EMPRESA_CONTEXT_FORBIDDEN");
  return candidate;
}

async function loadMeliConnection(svc: any, empresaId: string): Promise<{
  ecommerceId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string | null;
  sellerId: string | null;
}> {
  const { data: conn } = await svc
    .from("ecommerces")
    .select("id,status,external_account_id")
    .eq("empresa_id", empresaId)
    .eq("provider", "meli")
    .limit(1)
    .maybeSingle();

  if (!conn?.id) throw new Error("NOT_CONNECTED");
  if (conn.status === "disconnected") throw new Error("DISCONNECTED");

  const { data: sec } = await svc
    .from("ecommerce_connection_secrets")
    .select("access_token,refresh_token,token_expires_at")
    .eq("empresa_id", empresaId)
    .eq("ecommerce_id", conn.id)
    .maybeSingle();

  if (!sec?.access_token) throw new Error("NO_TOKEN");

  return {
    ecommerceId: String(conn.id),
    accessToken: String(sec.access_token),
    refreshToken: String(sec.refresh_token ?? ""),
    tokenExpiresAt: sec.token_expires_at ? String(sec.token_expires_at) : null,
    sellerId: conn.external_account_id ? String(conn.external_account_id) : null,
  };
}

async function ensureValidToken(
  svc: any,
  empresaId: string,
  conn: Awaited<ReturnType<typeof loadMeliConnection>>,
): Promise<string> {
  // Check if token is expired or about to expire (5 min buffer)
  if (conn.tokenExpiresAt) {
    const expiresAt = new Date(conn.tokenExpiresAt).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      // Refresh
      const result = await refreshMeliToken({
        clientId: MELI_CLIENT_ID,
        clientSecret: MELI_CLIENT_SECRET,
        refreshToken: conn.refreshToken,
      });
      if (!result.ok) throw new Error("TOKEN_REFRESH_FAILED");

      const newToken = String(result.data.access_token);
      const newRefresh = String(result.data.refresh_token ?? conn.refreshToken);
      const expiresIn = Number(result.data.expires_in ?? 21600);
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      await svc
        .from("ecommerce_connection_secrets")
        .update({
          access_token: newToken,
          refresh_token: newRefresh,
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("empresa_id", empresaId)
        .eq("ecommerce_id", conn.ecommerceId);

      conn.accessToken = newToken;
      conn.refreshToken = newRefresh;
      conn.tokenExpiresAt = newExpiresAt;
    }
  }
  return conn.accessToken;
}

async function logEvent(svc: any, params: {
  empresaId: string;
  ecommerceId: string;
  level: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await svc.from("ecommerce_logs").insert({
      empresa_id: params.empresaId,
      ecommerce_id: params.ecommerceId,
      provider: "meli",
      level: params.level,
      message: params.message,
      meta: params.meta ? sanitizeForLog(params.meta) : null,
      created_at: new Date().toISOString(),
    });
  } catch { /* best-effort logging */ }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleAccountInfo(svc: any, empresaId: string, conn: any, token: string) {
  const result = await meliFetchJson(buildMeliUrl("/users/me"), token);
  if (!result.ok) return { ok: false, error: "ML_API_ERROR", hint: classifyMeliHttpStatus(result.status).hint };

  const { id, nickname, first_name, last_name, email, seller_reputation, status: userStatus } = result.data;

  // Update seller_id if not set
  if (id && !conn.sellerId) {
    await svc.from("ecommerces")
      .update({ external_account_id: String(id) })
      .eq("id", conn.ecommerceId)
      .eq("empresa_id", empresaId);
  }

  return {
    ok: true,
    account: {
      id, nickname, first_name, last_name, email,
      reputation: seller_reputation,
      status: userStatus,
    },
  };
}

async function handleCategoriesSearch(token: string, body: any) {
  const query = String(body.query ?? "").trim();
  if (!query) return { ok: false, error: "QUERY_REQUIRED" };

  const url = buildMeliUrl(`/sites/${MELI_SITE_ID}/categories/search`, { q: query });
  const result = await meliFetchJson(url, token);
  if (!result.ok) return { ok: false, error: "ML_API_ERROR", status: result.status };

  return { ok: true, categories: result.data };
}

async function handleCategoriesTree(token: string) {
  const url = buildMeliUrl(`/sites/${MELI_SITE_ID}/categories`);
  const result = await meliFetchJson(url, token);
  if (!result.ok) return { ok: false, error: "ML_API_ERROR" };
  return { ok: true, categories: result.data };
}

async function handleCategoriesDetail(token: string, body: any) {
  const categoryId = String(body.category_id ?? "").trim();
  if (!categoryId) return { ok: false, error: "CATEGORY_ID_REQUIRED" };

  // Fetch category info + attributes in parallel
  const [catResult, attrResult] = await Promise.all([
    meliFetchJson(buildMeliUrl(`/categories/${categoryId}`), token),
    meliFetchJson(buildMeliUrl(`/categories/${categoryId}/attributes`), token),
  ]);

  if (!catResult.ok) return { ok: false, error: "ML_API_ERROR", status: catResult.status };

  return {
    ok: true,
    category: catResult.data,
    attributes: attrResult.ok ? attrResult.data : [],
  };
}

async function handleCategoriesPredict(token: string, body: any) {
  const title = String(body.title ?? "").trim();
  if (!title) return { ok: false, error: "TITLE_REQUIRED" };

  const url = buildMeliUrl(`/sites/${MELI_SITE_ID}/category_predictor/predict`, { title });
  const result = await meliFetchJson(url, token);
  if (!result.ok) return { ok: false, error: "ML_API_ERROR", status: result.status };

  return { ok: true, prediction: result.data };
}

async function handleCategoriesCacheRefresh(svc: any, empresaId: string, ecommerceId: string, token: string) {
  // Fetch top-level categories
  const treeResult = await meliFetchJson(buildMeliUrl(`/sites/${MELI_SITE_ID}/categories`), token);
  if (!treeResult.ok) return { ok: false, error: "ML_API_ERROR" };

  let cached = 0;
  for (const cat of treeResult.data) {
    // Fetch detail for each top-level category (with children)
    const detailResult = await meliFetchJson(buildMeliUrl(`/categories/${cat.id}`), token);
    if (!detailResult.ok) continue;

    const detail = detailResult.data;
    const children = Array.isArray(detail.children_categories) ? detail.children_categories : [];

    // Upsert top-level category
    await svc.from("meli_categories_cache").upsert({
      id: cat.id,
      empresa_id: empresaId,
      name: cat.name,
      parent_id: null,
      path_from_root: [{ id: cat.id, name: cat.name }],
      has_children: children.length > 0,
      picture: detail.picture ?? null,
      fetched_at: new Date().toISOString(),
    }, { onConflict: "empresa_id,id" });
    cached++;

    // Cache children (1 level deep for performance)
    for (const child of children) {
      await svc.from("meli_categories_cache").upsert({
        id: child.id,
        empresa_id: empresaId,
        name: child.name,
        parent_id: cat.id,
        path_from_root: [{ id: cat.id, name: cat.name }, { id: child.id, name: child.name }],
        has_children: true, // assume children have more children
        picture: null,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "empresa_id,id" });
      cached++;
    }
  }

  await logEvent(svc, {
    empresaId, ecommerceId,
    level: "info",
    message: `categories_cache_refreshed`,
    meta: { cached_count: cached },
  });

  return { ok: true, cached };
}

async function handleListingsValidate(svc: any, empresaId: string, token: string, body: any) {
  const anuncioId = String(body.produto_anuncio_id ?? "").trim();
  if (!anuncioId) return { ok: false, error: "ANUNCIO_ID_REQUIRED" };

  const { product, listing, images, attributes, brand, categoryId } = await loadListingData(svc, empresaId, anuncioId);

  const payload = meliItemFromRevo({ product, listing, images, attributes, brand, categoryId });
  const validation = validateMeliPayload(payload);

  return { ok: true, payload, validation };
}

async function handleListingsCreate(svc: any, empresaId: string, ecommerceId: string, token: string, body: any) {
  const anuncioId = String(body.produto_anuncio_id ?? "").trim();
  if (!anuncioId) return { ok: false, error: "ANUNCIO_ID_REQUIRED" };

  const { product, listing, images, attributes, brand, categoryId } = await loadListingData(svc, empresaId, anuncioId);

  const listingType = body.listing_type_id || listing.meli_listing_type_id || "gold_special";
  const payload = meliItemFromRevo({ product, listing, images, attributes, brand, categoryId, listingType });
  const validation = validateMeliPayload(payload);

  if (!validation.valid) {
    return { ok: false, error: "VALIDATION_FAILED", blockers: validation.blockers, warnings: validation.warnings };
  }

  // Create listing on ML
  const result = await meliPostJson(buildMeliUrl("/items"), token, payload);

  if (!result.ok) {
    const classified = classifyMeliHttpStatus(result.status);
    await updateAnuncioSyncStatus(svc, empresaId, anuncioId, "error", result.data?.message || classified.hint);
    await logEvent(svc, {
      empresaId, ecommerceId, level: "error",
      message: "listings_create_failed",
      meta: { anuncio_id: anuncioId, status: result.status, ml_error: result.data?.message, cause: result.data?.cause },
    });
    return { ok: false, error: "ML_API_ERROR", hint: classified.hint, ml_error: result.data };
  }

  const mlItemId = String(result.data.id);
  const permalink = String(result.data.permalink ?? "");

  // Update anuncio with ML data
  await svc.from("produto_anuncios").update({
    identificador_externo: mlItemId,
    url_anuncio: permalink,
    sync_status: "synced",
    status_anuncio: "ativo",
    last_sync_at: new Date().toISOString(),
    last_error: null,
    meli_listing_type_id: listingType,
  }).eq("id", anuncioId).eq("empresa_id", empresaId);

  await logEvent(svc, {
    empresaId, ecommerceId, level: "info",
    message: "listings_created",
    meta: { anuncio_id: anuncioId, ml_item_id: mlItemId, permalink },
  });

  return { ok: true, ml_item_id: mlItemId, permalink };
}

async function handleListingsUpdate(svc: any, empresaId: string, ecommerceId: string, token: string, body: any) {
  const anuncioId = String(body.produto_anuncio_id ?? "").trim();
  if (!anuncioId) return { ok: false, error: "ANUNCIO_ID_REQUIRED" };

  const { product, listing, images, attributes, brand, categoryId } = await loadListingData(svc, empresaId, anuncioId);
  const mlItemId = listing.identificador_externo;
  if (!mlItemId) return { ok: false, error: "NOT_PUBLISHED", hint: "Este anúncio ainda não foi publicado no ML." };

  const payload = meliItemFromRevo({ product, listing, images, attributes, brand, categoryId });

  // ML limits what can be updated: title, price, available_quantity, pictures, attributes, description
  const updatePayload: Record<string, unknown> = {
    title: payload.title,
    price: payload.price,
    available_quantity: payload.available_quantity,
    pictures: payload.pictures,
  };

  const result = await meliPutJson(buildMeliUrl(`/items/${mlItemId}`), token, updatePayload);

  if (!result.ok) {
    const classified = classifyMeliHttpStatus(result.status);
    await updateAnuncioSyncStatus(svc, empresaId, anuncioId, "error", result.data?.message || classified.hint);
    return { ok: false, error: "ML_API_ERROR", hint: classified.hint, ml_error: result.data };
  }

  // Update description separately (ML requires separate endpoint)
  if (payload.description?.plain_text) {
    await meliPutJson(
      buildMeliUrl(`/items/${mlItemId}/description`),
      token,
      { plain_text: payload.description.plain_text },
    );
  }

  await updateAnuncioSyncStatus(svc, empresaId, anuncioId, "synced", null);
  await logEvent(svc, {
    empresaId, ecommerceId, level: "info",
    message: "listings_updated",
    meta: { anuncio_id: anuncioId, ml_item_id: mlItemId },
  });

  return { ok: true, ml_item_id: mlItemId };
}

async function handleListingsStatusChange(
  svc: any, empresaId: string, ecommerceId: string, token: string,
  body: any, newStatus: "paused" | "active" | "closed",
) {
  const anuncioId = String(body.produto_anuncio_id ?? "").trim();
  if (!anuncioId) return { ok: false, error: "ANUNCIO_ID_REQUIRED" };

  const { data: listing } = await svc.from("produto_anuncios")
    .select("identificador_externo").eq("id", anuncioId).eq("empresa_id", empresaId).maybeSingle();
  if (!listing?.identificador_externo) return { ok: false, error: "NOT_PUBLISHED" };

  const mlItemId = String(listing.identificador_externo);
  const result = await meliPutJson(buildMeliUrl(`/items/${mlItemId}`), token, { status: newStatus });

  if (!result.ok) {
    return { ok: false, error: "ML_API_ERROR", hint: classifyMeliHttpStatus(result.status).hint };
  }

  const statusMap: Record<string, string> = { active: "ativo", paused: "pausado", closed: "finalizado" };
  await svc.from("produto_anuncios").update({
    status_anuncio: statusMap[newStatus] || newStatus,
    last_sync_at: new Date().toISOString(),
  }).eq("id", anuncioId).eq("empresa_id", empresaId);

  await logEvent(svc, {
    empresaId, ecommerceId, level: "info",
    message: `listings_${newStatus}`,
    meta: { anuncio_id: anuncioId, ml_item_id: mlItemId },
  });

  return { ok: true, ml_item_id: mlItemId, status: newStatus };
}

async function handleListingsGet(token: string, body: any) {
  const mlItemId = String(body.ml_item_id ?? "").trim();
  if (!mlItemId) return { ok: false, error: "ML_ITEM_ID_REQUIRED" };

  const result = await meliFetchJson(buildMeliUrl(`/items/${mlItemId}`), token);
  if (!result.ok) return { ok: false, error: "ML_API_ERROR", status: result.status };
  return { ok: true, item: result.data };
}

async function handleSyncStock(svc: any, empresaId: string, ecommerceId: string, token: string, body: any) {
  const anuncioId = String(body.produto_anuncio_id ?? "").trim();
  if (!anuncioId) return { ok: false, error: "ANUNCIO_ID_REQUIRED" };

  const { listing, product } = await loadListingData(svc, empresaId, anuncioId);
  if (!listing.identificador_externo) return { ok: false, error: "NOT_PUBLISHED" };

  const quantity = Math.max(0, Math.trunc(Number(product.estoque_disponivel ?? product.estoque_atual ?? 0)));
  const result = await meliPutJson(
    buildMeliUrl(`/items/${listing.identificador_externo}`),
    token,
    { available_quantity: quantity },
  );

  if (!result.ok) {
    await updateAnuncioSyncStatus(svc, empresaId, anuncioId, "error", result.data?.message || "stock sync failed");
    return { ok: false, error: "ML_API_ERROR" };
  }

  await updateAnuncioSyncStatus(svc, empresaId, anuncioId, "synced", null);
  return { ok: true, quantity };
}

async function handleSyncPrice(svc: any, empresaId: string, ecommerceId: string, token: string, body: any) {
  const anuncioId = String(body.produto_anuncio_id ?? "").trim();
  if (!anuncioId) return { ok: false, error: "ANUNCIO_ID_REQUIRED" };

  const { listing, product } = await loadListingData(svc, empresaId, anuncioId);
  if (!listing.identificador_externo) return { ok: false, error: "NOT_PUBLISHED" };

  const price = Number(listing.preco_especifico ?? product.preco_promocional ?? product.preco_venda ?? 0);
  if (price <= 0) return { ok: false, error: "INVALID_PRICE" };

  const result = await meliPutJson(
    buildMeliUrl(`/items/${listing.identificador_externo}`),
    token,
    { price },
  );

  if (!result.ok) {
    await updateAnuncioSyncStatus(svc, empresaId, anuncioId, "error", result.data?.message || "price sync failed");
    return { ok: false, error: "ML_API_ERROR" };
  }

  await updateAnuncioSyncStatus(svc, empresaId, anuncioId, "synced", null);
  return { ok: true, price };
}

async function handleBatchSync(
  svc: any, empresaId: string, ecommerceId: string, token: string,
  body: any, kind: "stock" | "price",
) {
  const anuncioIds = Array.isArray(body.produto_anuncio_ids) ? body.produto_anuncio_ids : [];
  if (anuncioIds.length === 0) return { ok: false, error: "NO_ANUNCIOS" };

  const results: { anuncio_id: string; ok: boolean; error?: string }[] = [];

  for (const id of anuncioIds.slice(0, 50)) { // Max 50 per batch
    try {
      const handler = kind === "stock" ? handleSyncStock : handleSyncPrice;
      const result = await handler(svc, empresaId, ecommerceId, token, { produto_anuncio_id: id });
      results.push({ anuncio_id: id, ok: !!result.ok, error: result.ok ? undefined : String(result.error) });
    } catch (e: any) {
      results.push({ anuncio_id: id, ok: false, error: e?.message || "unknown" });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  await logEvent(svc, {
    empresaId, ecommerceId, level: failed > 0 ? "warn" : "info",
    message: `batch_sync_${kind}_completed`,
    meta: { total: results.length, succeeded, failed },
  });

  return { ok: true, results, summary: { total: results.length, succeeded, failed } };
}

async function handleQuestionsList(token: string, conn: any) {
  if (!conn.sellerId) return { ok: false, error: "SELLER_ID_UNKNOWN", hint: "Execute account.info primeiro." };

  const url = buildMeliUrl("/questions/search", {
    seller_id: conn.sellerId,
    sort_fields: "date_created",
    sort_types: "DESC",
    limit: "50",
  });
  const result = await meliFetchJson(url, token);
  if (!result.ok) return { ok: false, error: "ML_API_ERROR" };
  return { ok: true, questions: result.data.questions ?? [], total: result.data.total ?? 0 };
}

async function handleQuestionsAnswer(token: string, body: any) {
  const questionId = String(body.question_id ?? "").trim();
  const text = String(body.text ?? "").trim();
  if (!questionId || !text) return { ok: false, error: "QUESTION_ID_AND_TEXT_REQUIRED" };

  const result = await meliPostJson(buildMeliUrl("/answers"), token, {
    question_id: Number(questionId),
    text,
  });
  if (!result.ok) return { ok: false, error: "ML_API_ERROR", ml_error: result.data };
  return { ok: true, answer: result.data };
}

async function handleHealthCheck(svc: any, empresaId: string, conn: any, token: string) {
  // Test API access
  const accountResult = await meliFetchJson(buildMeliUrl("/users/me"), token);
  const apiHealthy = accountResult.ok;

  // Get health summary from RPC
  const { data: health } = await svc.rpc("meli_health_summary");

  return {
    ok: true,
    api_healthy: apiHealthy,
    account: apiHealthy ? { id: accountResult.data?.id, nickname: accountResult.data?.nickname } : null,
    ...(health ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Data loading helpers
// ---------------------------------------------------------------------------

async function loadListingData(svc: any, empresaId: string, anuncioId: string) {
  // Load anuncio
  const { data: listing } = await svc.from("produto_anuncios")
    .select("*")
    .eq("id", anuncioId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (!listing) throw new Error("ANUNCIO_NOT_FOUND");

  // Load product
  const { data: product } = await svc.from("produtos")
    .select("*")
    .eq("id", listing.produto_id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  // Load images
  const { data: imgRows } = await svc.from("produto_imagens")
    .select("url,principal,ordem")
    .eq("produto_id", listing.produto_id)
    .eq("empresa_id", empresaId)
    .order("principal", { ascending: false })
    .order("ordem", { ascending: true });
  const images = Array.isArray(imgRows) ? imgRows : [];

  // Load ML attributes
  const { data: attrRows } = await svc.from("meli_listing_attributes")
    .select("attribute_id,attribute_name,value_id,value_name")
    .eq("produto_anuncio_id", anuncioId)
    .eq("empresa_id", empresaId);
  const attributes = Array.isArray(attrRows) ? attrRows : [];

  // Load brand name
  let brand: string | null = null;
  if (product.marca_id) {
    const { data: marca } = await svc.from("marcas")
      .select("nome")
      .eq("id", product.marca_id)
      .maybeSingle();
    brand = marca?.nome ?? null;
  }

  // Resolve category: from listing or from mapping
  let categoryId = listing.categoria_marketplace || "";
  if (!categoryId && product.grupo_id) {
    const { data: mapping } = await svc.from("meli_category_mappings")
      .select("meli_category_id")
      .eq("empresa_id", empresaId)
      .eq("grupo_id", product.grupo_id)
      .maybeSingle();
    categoryId = mapping?.meli_category_id || "";
  }

  // Load stock info
  const { data: stockRows } = await svc.from("estoque_lotes")
    .select("saldo")
    .eq("empresa_id", empresaId)
    .eq("produto_id", listing.produto_id);

  if (Array.isArray(stockRows) && stockRows.length > 0) {
    const totalStock = stockRows.reduce((sum: number, r: any) => sum + Number(r?.saldo ?? 0), 0);
    product.estoque_disponivel = totalStock;
  }

  return { product, listing, images, attributes, brand, categoryId };
}

async function updateAnuncioSyncStatus(svc: any, empresaId: string, anuncioId: string, syncStatus: string, lastError: string | null) {
  await svc.from("produto_anuncios").update({
    sync_status: syncStatus,
    last_sync_at: new Date().toISOString(),
    last_error: lastError,
  }).eq("id", anuncioId).eq("empresa_id", empresaId);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const requestId = getRequestId(req);

  try {
    // Auth
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

    const baseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: me } = await baseUser.auth.getUser();
    const callerId = me?.user?.id;
    if (!callerId) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

    // Empresa resolution
    let empresaId: string;
    try {
      empresaId = await resolveEmpresaId({ baseUser, svc, callerId, req });
    } catch (e: any) {
      return json(403, { ok: false, error: e?.message || "EMPRESA_ID_REQUIRED" }, cors);
    }

    // RBAC
    const allowed = await hasPermissionOrOwnerAdmin(baseUser, svc, callerId, empresaId, "ecommerce", "manage");
    if (!allowed) return json(403, { ok: false, error: "FORBIDDEN_RBAC" }, cors);

    // Parse body
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "").trim() as Action;
    if (!action) return json(400, { ok: false, error: "ACTION_REQUIRED" }, cors);

    // Load ML connection
    let conn: Awaited<ReturnType<typeof loadMeliConnection>>;
    try {
      conn = await loadMeliConnection(svc, empresaId);
    } catch (e: any) {
      return json(400, { ok: false, error: e?.message || "CONNECTION_ERROR" }, cors);
    }

    // Ensure valid token
    let token: string;
    try {
      token = await ensureValidToken(svc, empresaId, conn);
    } catch {
      return json(401, { ok: false, error: "TOKEN_REFRESH_FAILED", hint: "Reconecte sua conta do Mercado Livre." }, cors);
    }

    // Track finops
    await finopsTrackUsage({ svc, empresaId, provider: "meli", action, requestId }).catch(() => null);

    // Route action
    let result: Record<string, unknown>;

    switch (action) {
      case "account.info":
        result = await handleAccountInfo(svc, empresaId, conn, token);
        break;
      case "categories.search":
        result = await handleCategoriesSearch(token, body);
        break;
      case "categories.tree":
        result = await handleCategoriesTree(token);
        break;
      case "categories.detail":
        result = await handleCategoriesDetail(token, body);
        break;
      case "categories.predict":
        result = await handleCategoriesPredict(token, body);
        break;
      case "categories.cache_refresh":
        result = await handleCategoriesCacheRefresh(svc, empresaId, conn.ecommerceId, token);
        break;
      case "listings.validate":
        result = await handleListingsValidate(svc, empresaId, token, body);
        break;
      case "listings.create":
        result = await handleListingsCreate(svc, empresaId, conn.ecommerceId, token, body);
        break;
      case "listings.update":
        result = await handleListingsUpdate(svc, empresaId, conn.ecommerceId, token, body);
        break;
      case "listings.pause":
        result = await handleListingsStatusChange(svc, empresaId, conn.ecommerceId, token, body, "paused");
        break;
      case "listings.activate":
        result = await handleListingsStatusChange(svc, empresaId, conn.ecommerceId, token, body, "active");
        break;
      case "listings.close":
        result = await handleListingsStatusChange(svc, empresaId, conn.ecommerceId, token, body, "closed");
        break;
      case "listings.get":
        result = await handleListingsGet(token, body);
        break;
      case "listings.description.set": {
        const anuncioId = String(body.produto_anuncio_id ?? "").trim();
        const description = String(body.description ?? "").trim();
        if (!anuncioId || !description) {
          result = { ok: false, error: "ANUNCIO_ID_AND_DESCRIPTION_REQUIRED" };
          break;
        }
        const { data: ld } = await svc.from("produto_anuncios")
          .select("identificador_externo").eq("id", anuncioId).eq("empresa_id", empresaId).maybeSingle();
        if (!ld?.identificador_externo) { result = { ok: false, error: "NOT_PUBLISHED" }; break; }
        const descResult = await meliPutJson(
          buildMeliUrl(`/items/${ld.identificador_externo}/description`),
          token,
          { plain_text: description },
        );
        result = descResult.ok ? { ok: true } : { ok: false, error: "ML_API_ERROR" };
        break;
      }
      case "sync.stock":
        result = await handleSyncStock(svc, empresaId, conn.ecommerceId, token, body);
        break;
      case "sync.price":
        result = await handleSyncPrice(svc, empresaId, conn.ecommerceId, token, body);
        break;
      case "sync.stock.batch":
        result = await handleBatchSync(svc, empresaId, conn.ecommerceId, token, body, "stock");
        break;
      case "sync.price.batch":
        result = await handleBatchSync(svc, empresaId, conn.ecommerceId, token, body, "price");
        break;
      case "questions.list":
        result = await handleQuestionsList(token, conn);
        break;
      case "questions.answer":
        result = await handleQuestionsAnswer(token, body);
        break;
      case "health.check":
        result = await handleHealthCheck(svc, empresaId, conn, token);
        break;
      default:
        result = { ok: false, error: "UNKNOWN_ACTION" };
    }

    return json(result.ok ? 200 : 400, result, cors);
  } catch (e: any) {
    console.error(`[meli-admin] Unhandled error:`, e);
    return json(500, {
      ok: false,
      error: "INTERNAL_ERROR",
      message: sanitizeForLog(e?.message ?? "unknown"),
    }, cors);
  }
});
