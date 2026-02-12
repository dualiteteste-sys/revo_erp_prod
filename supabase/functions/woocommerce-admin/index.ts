import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { aesGcmDecryptFromString, aesGcmEncryptToString } from "../_shared/crypto.ts";
import { getRequestId } from "../_shared/request.ts";
import { hasPermissionOrOwnerAdmin } from "../_shared/rbac.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { detectWooErrorCode, resolveWooError } from "../_shared/woocommerceErrors.ts";
import { buildWooApiUrl, classifyWooHttpStatus, isEmpresaContextAllowed, normalizeWooStoreUrl, shouldFallbackToActiveEmpresa } from "../_shared/woocommerceHardening.ts";
import { buildWooStoreStatusContract } from "../_shared/woocommerceStatusContract.ts";

type Action =
  | "stores.list"
  | "stores.create"
  | "stores.healthcheck"
  | "stores.webhooks.register"
  | "stores.product_map.build"
  | "stores.product_map.list"
  | "stores.sync.stock"
  | "stores.sync.price"
  | "stores.reconcile.orders"
  | "stores.status"
  | "stores.pause"
  | "stores.unpause"
  | "stores.worker.run"
  | "stores.jobs.requeue"
  | "stores.products.search"
  | "stores.catalog.preview.export"
  | "stores.catalog.run.export"
  | "stores.catalog.preview.sync_price"
  | "stores.catalog.run.sync_price"
  | "stores.catalog.preview.sync_stock"
  | "stores.catalog.run.sync_stock"
  | "stores.catalog.preview.import"
  | "stores.catalog.run.import"
  | "stores.runs.get"
  | "stores.runs.list"
  | "stores.runs.retry_failed"
  | "stores.listings.by_products"
  | "stores.listings.by_product"
  | "stores.listings.link_by_sku"
  | "stores.listings.unlink";

type CatalogRunType = "EXPORT" | "IMPORT" | "SYNC_PRICE" | "SYNC_STOCK";
type CatalogItemAction = "CREATE" | "UPDATE" | "SKIP" | "BLOCK";

type CatalogPreviewItem = {
  sku: string | null;
  revo_product_id: string | null;
  woo_product_id: number | null;
  woo_variation_id: number | null;
  action: CatalogItemAction;
  warnings: string[];
  blockers: string[];
  diff: Record<string, unknown>;
};

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function randomSecretBase64(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function wooFetchJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const resp = await fetch(url, init);
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function resolveEmpresaId(params: { baseUser: any; svc: any; req: Request; callerId: string }): Promise<string> {
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
  if (!isEmpresaContextAllowed(candidate, userEmpresaIds)) throw new Error("EMPRESA_CONTEXT_FORBIDDEN");
  return candidate;
}

async function logTenantSpoofBlocked(params: {
  svc: any;
  requestId: string;
  callerId: string;
  headerEmpresaId: string;
  body: any;
}) {
  const storeIdFromBody = String(params.body?.store_id ?? "").trim() || null;
  let logStore: { id: string; empresa_id: string } | null = null;

  if (storeIdFromBody) {
    const { data } = await params.svc
      .from("integrations_woocommerce_store")
      .select("id,empresa_id")
      .eq("id", storeIdFromBody)
      .maybeSingle();
    if (data?.id && data?.empresa_id) logStore = { id: String(data.id), empresa_id: String(data.empresa_id) };
  }

  if (!logStore) {
    const { data } = await params.svc
      .from("integrations_woocommerce_store")
      .select("id,empresa_id")
      .eq("empresa_id", params.headerEmpresaId)
      .limit(1)
      .maybeSingle();
    if (data?.id && data?.empresa_id) logStore = { id: String(data.id), empresa_id: String(data.empresa_id) };
  }

  if (!logStore) return;

  await params.svc.from("woocommerce_sync_log").insert({
    empresa_id: logStore.empresa_id,
    store_id: logStore.id,
    level: "error",
    message: "tenant_spoof_blocked",
    meta: sanitizeForLog({
      request_id: params.requestId,
      caller_id: params.callerId,
      action: String(params.body?.action ?? "").trim() || null,
      header_empresa_id: params.headerEmpresaId,
      attempted_store_id: storeIdFromBody,
      error_code: "EMPRESA_CONTEXT_FORBIDDEN",
    }),
  }).catch(() => null);
}

async function resolveEmpresaIdFallback(baseUser: any): Promise<string> {
  const { data, error } = await baseUser.rpc("active_empresa_get_for_current_user", {});
  if (error || !data) throw new Error("EMPRESA_ID_REQUIRED");
  return String(data).trim();
}

async function countByStatus(svc: any, empresaId: string, storeId: string, status: string): Promise<number> {
  const { count } = await svc
    .from("woocommerce_sync_job")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("store_id", storeId)
    .eq("status", status);
  return Number(count ?? 0);
}

async function mapQualitySnapshot(svc: any, empresaId: string, storeId: string) {
  const { count: total } = await svc
    .from("woocommerce_product_map")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("store_id", storeId);

  const { count: missingRevoMap } = await svc
    .from("woocommerce_product_map")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("store_id", storeId)
    .is("revo_product_id", null);

  const { data: dupRows } = await svc
    .from("woocommerce_product_map")
    .select("sku")
    .eq("empresa_id", empresaId)
    .eq("store_id", storeId)
    .not("sku", "is", null);

  const skuCount = new Map<string, number>();
  for (const row of (Array.isArray(dupRows) ? dupRows : [])) {
    const sku = String(row?.sku ?? "").trim().toLowerCase();
    if (!sku) continue;
    skuCount.set(sku, (skuCount.get(sku) ?? 0) + 1);
  }
  const duplicatedSkus = Array.from(skuCount.values()).filter((count) => count > 1).length;

  return {
    total: Number(total ?? 0),
    missing_revo_map: Number(missingRevoMap ?? 0),
    duplicated_skus: duplicatedSkus,
  };
}

async function countOrderMap(svc: any, empresaId: string, storeId: string): Promise<number> {
  const { count } = await svc
    .from("woocommerce_order_map")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("store_id", storeId);
  return Number(count ?? 0);
}

async function latestOrderMapRow(svc: any, empresaId: string, storeId: string) {
  const { data } = await svc
    .from("woocommerce_order_map")
    .select("woo_updated_at,imported_at")
    .eq("empresa_id", empresaId)
    .eq("store_id", storeId)
    .order("woo_updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function logWooEvent(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  code: string;
  context: string;
  level?: "debug" | "info" | "warn" | "error";
  meta?: Record<string, unknown>;
}) {
  const resolved = resolveWooError(params.code);
  await params.svc.from("woocommerce_sync_log").insert({
    empresa_id: params.empresaId,
    store_id: params.storeId,
    level: params.level ?? resolved.severity,
    message: params.context,
    meta: sanitizeForLog({
      code: resolved.code,
      hint: resolved.hint,
      ...params.meta,
    }),
  });
}

async function workerInvoke(params: { supabaseUrl: string; workerKey: string; storeId: string; limit?: number }) {
  const url = `${params.supabaseUrl}/functions/v1/woocommerce-worker`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-woocommerce-worker-key": params.workerKey,
    },
    body: JSON.stringify({ store_id: params.storeId, limit: params.limit ?? 10 }),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

function normalizeSku(input: unknown): string {
  return String(input ?? "").trim();
}

function normalizeSkuKey(input: unknown): string {
  return normalizeSku(input).toLowerCase();
}

function toWooStatusFromRevo(status: string | null | undefined): "publish" | "draft" {
  return String(status ?? "").trim() === "ativo" ? "publish" : "draft";
}

function toWooPriceString(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function toWooStockInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function diffValue(oldValue: unknown, newValue: unknown): { from: unknown; to: unknown } | null {
  if (oldValue === newValue) return null;
  return { from: oldValue ?? null, to: newValue ?? null };
}

function summarizePreview(items: CatalogPreviewItem[]) {
  const summary = { create: 0, update: 0, skip: 0, block: 0 };
  for (const item of items) {
    if (item.action === "CREATE") summary.create += 1;
    if (item.action === "UPDATE") summary.update += 1;
    if (item.action === "SKIP") summary.skip += 1;
    if (item.action === "BLOCK") summary.block += 1;
  }
  return summary;
}

async function loadRevoProductsForCatalog(params: {
  svc: any;
  empresaId: string;
  revoProductIds: string[];
  skus: string[];
}) {
  const ids = Array.from(new Set(params.revoProductIds.map((v) => String(v ?? "").trim()).filter(Boolean)));
  const skus = Array.from(new Set(params.skus.map((v) => normalizeSku(v)).filter(Boolean)));
  let query = params.svc
    .from("produtos")
    .select("id,nome,sku,status,preco_venda,estoque_atual,descricao,updated_at,produto_pai_id")
    .eq("empresa_id", params.empresaId)
    .is("deleted_at", null)
    .limit(1000);

  if (ids.length > 0) query = query.in("id", ids);
  else if (skus.length > 0) query = query.in("sku", skus);

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadStoreMapBySku(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  skus: string[];
}) {
  const skus = Array.from(new Set(params.skus.map((v) => normalizeSku(v)).filter(Boolean)));
  if (skus.length === 0) return [] as any[];
  const { data, error } = await params.svc
    .from("woocommerce_product_map")
    .select("id,sku,revo_product_id,woo_product_id,woo_variation_id,last_synced_price_at,last_synced_stock_at")
    .eq("empresa_id", params.empresaId)
    .eq("store_id", params.storeId)
    .in("sku", skus);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function buildExportPreview(params: {
  products: any[];
  mapRows: any[];
  mode: "EXPORT" | "SYNC_PRICE" | "SYNC_STOCK";
}) {
  const mapBySku = new Map<string, any[]>();
  for (const row of params.mapRows) {
    const key = normalizeSkuKey(row?.sku);
    if (!key) continue;
    const list = mapBySku.get(key) ?? [];
    list.push(row);
    mapBySku.set(key, list);
  }

  const items: CatalogPreviewItem[] = [];
  for (const product of params.products) {
    const sku = normalizeSku(product?.sku);
    const key = normalizeSkuKey(sku);
    const mapped = key ? (mapBySku.get(key) ?? []) : [];
    const blockers: string[] = [];
    const warnings: string[] = [];
    const diff: Record<string, unknown> = {};

    if (!sku) blockers.push("SKU ausente no produto Revo.");
    if (mapped.length > 1) blockers.push("SKU duplicado no vínculo Woo. Resolva conflitos antes de sincronizar.");

    const map = mapped[0] ?? null;
    const wooProductId = map ? Number(map.woo_product_id ?? 0) || null : null;
    const wooVariationId = map ? Number(map.woo_variation_id ?? 0) || null : null;

    const wantedPrice = toWooPriceString(product?.preco_venda);
    const wantedStock = toWooStockInt(product?.estoque_atual);
    if (params.mode !== "SYNC_STOCK") {
      const d = diffValue(null, wantedPrice);
      if (d) diff.regular_price = d;
    }
    if (params.mode !== "SYNC_PRICE") {
      const d = diffValue(null, wantedStock);
      if (d) diff.stock_quantity = d;
    }

    let action: CatalogItemAction = "SKIP";
    if (blockers.length > 0) action = "BLOCK";
    else if (!wooProductId && params.mode === "EXPORT") action = "CREATE";
    else if (!wooProductId && params.mode !== "EXPORT") action = "BLOCK";
    else action = "UPDATE";

    if (!wooProductId && params.mode !== "EXPORT") {
      blockers.push("Produto ainda não vinculado ao Woo para esta loja.");
    }
    if (wooVariationId) {
      warnings.push("Item vinculado como variação. Será sincronizado no endpoint de variações.");
    }

    items.push({
      sku: sku || null,
      revo_product_id: String(product?.id ?? "") || null,
      woo_product_id: wooProductId,
      woo_variation_id: wooVariationId,
      action,
      warnings,
      blockers,
      diff,
    });
  }
  return items;
}

function buildImportPreview(params: {
  wooProducts: any[];
  revoBySku: Map<string, any>;
  mapBySku: Map<string, any[]>;
}) {
  const items: CatalogPreviewItem[] = [];
  for (const woo of params.wooProducts) {
    const sku = normalizeSku(woo?.sku);
    const key = normalizeSkuKey(sku);
    const warnings: string[] = [];
    const blockers: string[] = [];
    const diff: Record<string, unknown> = {};

    if (!sku) blockers.push("Produto Woo sem SKU.");
    const revo = key ? params.revoBySku.get(key) : null;
    const mapped = key ? (params.mapBySku.get(key) ?? []) : [];
    if (mapped.length > 1) blockers.push("SKU com múltiplos vínculos no map Woo.");

    const dName = diffValue(revo?.nome ?? null, woo?.name ?? null);
    if (dName) diff.nome = dName;
    const dPrice = diffValue(revo?.preco_venda != null ? toWooPriceString(revo.preco_venda) : null, String(woo?.regular_price ?? "").trim() || null);
    if (dPrice) diff.preco = dPrice;
    const dStatus = diffValue(revo?.status ?? null, woo?.status === "publish" ? "ativo" : "inativo");
    if (dStatus) diff.status = dStatus;

    let action: CatalogItemAction = "SKIP";
    if (blockers.length > 0) action = "BLOCK";
    else if (revo) action = "UPDATE";
    else action = "CREATE";

    items.push({
      sku: sku || null,
      revo_product_id: revo?.id ? String(revo.id) : null,
      woo_product_id: Number(woo?.id ?? 0) || null,
      woo_variation_id: null,
      action,
      warnings,
      blockers,
      diff,
    });
  }
  return items;
}

async function enqueueRunJob(params: {
  user: any;
  storeId: string;
  runType: CatalogRunType;
  payload: Record<string, unknown>;
}) {
  const jobType = params.runType === "EXPORT"
    ? "CATALOG_EXPORT"
    : params.runType === "IMPORT"
    ? "CATALOG_IMPORT"
    : params.runType === "SYNC_PRICE"
    ? "PRICE_SYNC"
    : "STOCK_SYNC";
  const { data, error } = await params.user.rpc("woocommerce_sync_job_enqueue", {
    p_store_id: params.storeId,
    p_type: jobType,
    p_payload: params.payload,
    p_dedupe_key: `run:${String(params.payload?.run_id ?? "")}`,
    p_next_run_at: new Date().toISOString(),
  });
  if (error) throw error;
  return String(data ?? "");
}

async function createRunWithItems(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  runType: CatalogRunType;
  callerId: string;
  options: Record<string, unknown>;
  previewItems: CatalogPreviewItem[];
}) {
  const { data: run, error: runErr } = await params.svc
    .from("woocommerce_sync_run")
    .insert({
      empresa_id: params.empresaId,
      store_id: params.storeId,
      type: params.runType,
      status: "queued",
      options: sanitizeForLog(params.options),
      summary: {
        planned: params.previewItems.length,
        updated: 0,
        skipped: 0,
        failed: 0,
      },
      created_by: params.callerId,
    })
    .select("id,created_at")
    .single();
  if (runErr || !run?.id) throw runErr ?? new Error("RUN_CREATE_FAILED");

  const rows = params.previewItems.map((item) => ({
    run_id: run.id,
    empresa_id: params.empresaId,
    store_id: params.storeId,
    sku: item.sku,
    revo_product_id: item.revo_product_id,
    woo_product_id: item.woo_product_id,
    woo_variation_id: item.woo_variation_id,
    action: item.action,
    status: item.action === "BLOCK" ? "ERROR" : item.action === "SKIP" ? "SKIPPED" : "QUEUED",
    error_code: item.blockers.length > 0 ? "WOO_PREVIEW_BLOCKED" : null,
    hint: item.blockers.length > 0 ? item.blockers.join(" ") : null,
    diff: sanitizeForLog({
      warnings: item.warnings,
      blockers: item.blockers,
      diff: item.diff,
    }),
    last_error: item.blockers.length > 0 ? item.blockers.join(" ") : null,
    last_error_at: item.blockers.length > 0 ? new Date().toISOString() : null,
  }));
  const { error: itemErr } = await params.svc.from("woocommerce_sync_run_item").insert(rows);
  if (itemErr) throw itemErr;

  return String(run.id);
}

async function fetchRunWithItems(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  runId: string;
  limitItems?: number;
}) {
  const { data: run, error: runErr } = await params.svc
    .from("woocommerce_sync_run")
    .select("id,type,status,options,summary,created_by,created_at,started_at,finished_at,updated_at")
    .eq("id", params.runId)
    .eq("empresa_id", params.empresaId)
    .eq("store_id", params.storeId)
    .maybeSingle();
  if (runErr || !run?.id) return null;

  const { data: items } = await params.svc
    .from("woocommerce_sync_run_item")
    .select("id,sku,revo_product_id,woo_product_id,woo_variation_id,action,status,error_code,hint,last_error,last_error_at,diff,created_at,updated_at")
    .eq("run_id", params.runId)
    .eq("empresa_id", params.empresaId)
    .eq("store_id", params.storeId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(params.limitItems ?? 300), 500)));

  return { run, items: Array.isArray(items) ? items : [] };
}

async function listRuns(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  limit: number;
}) {
  const { data, error } = await params.svc
    .from("woocommerce_sync_run")
    .select("id,type,status,summary,created_at,started_at,finished_at,updated_at")
    .eq("empresa_id", params.empresaId)
    .eq("store_id", params.storeId)
    .order("created_at", { ascending: false })
    .limit(params.limit);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function upsertListingByMap(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  revoProductId: string | null;
  sku: string | null;
  wooProductId: number | null;
  wooVariationId: number | null;
  listingStatus: "linked" | "unlinked" | "conflict" | "error";
  lastErrorCode?: string | null;
  lastErrorHint?: string | null;
  touchPrice?: boolean;
  touchStock?: boolean;
}) {
  const revoProductId = String(params.revoProductId ?? "").trim();
  if (!revoProductId) return;
  const nowIso = new Date().toISOString();
  await params.svc
    .from("woocommerce_listing")
    .upsert({
      empresa_id: params.empresaId,
      store_id: params.storeId,
      revo_product_id: revoProductId,
      sku: params.sku,
      woo_product_id: params.wooProductId,
      woo_variation_id: params.wooVariationId,
      listing_status: params.listingStatus,
      last_sync_price_at: params.touchPrice ? nowIso : null,
      last_sync_stock_at: params.touchStock ? nowIso : null,
      last_error_code: params.lastErrorCode ?? null,
      last_error_hint: params.lastErrorHint ?? null,
    }, { onConflict: "store_id,revo_product_id" });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const masterKey = Deno.env.get("INTEGRATIONS_MASTER_KEY") ?? "";
  const workerKey = Deno.env.get("WOOCOMMERCE_WORKER_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { ok: false, error: "ENV_NOT_CONFIGURED" }, cors);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const requestId = getRequestId(req);
  const baseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}`, "x-revo-request-id": requestId } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const svc = createClient(supabaseUrl, serviceKey, {
    global: { headers: { "x-revo-request-id": requestId } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await baseUser.auth.getUser();
  if (userErr || !userData?.user?.id) return json(401, { ok: false, error: "INVALID_TOKEN" }, cors);
  const callerId = String(userData.user.id);

  const body = (await req.json().catch(() => ({}))) as any;
  const action = String(body?.action ?? "").trim() as Action;
  if (!action) return json(400, { ok: false, error: "ACTION_REQUIRED" }, cors);
  const needsMasterKey = action === "stores.create" ||
    action === "stores.healthcheck" ||
    action === "stores.webhooks.register" ||
    action === "stores.products.search" ||
    action === "stores.catalog.preview.import" ||
    action === "stores.catalog.run.import";
  if (needsMasterKey && !masterKey) return json(500, { ok: false, error: "MASTER_KEY_MISSING" }, cors);

  const headerEmpresaId = (req.headers.get("x-empresa-id") ?? "").trim();
  let empresaId = "";
  if (!shouldFallbackToActiveEmpresa({ headerEmpresaId, errorCode: "EMPRESA_ID_REQUIRED" })) {
    try {
      empresaId = await resolveEmpresaId({ baseUser, svc, req, callerId });
    } catch (e: any) {
      const message = String(e?.message ?? "EMPRESA_ID_REQUIRED");
      if (message === "EMPRESA_CONTEXT_FORBIDDEN") {
        await logTenantSpoofBlocked({ svc, requestId, callerId, headerEmpresaId, body });
        const resolved = resolveWooError("EMPRESA_CONTEXT_FORBIDDEN");
        return json(403, {
          ok: false,
          error: "EMPRESA_CONTEXT_FORBIDDEN",
          error_code: "EMPRESA_CONTEXT_FORBIDDEN",
          hint: resolved.hint,
        }, cors);
      }
      return json(400, { ok: false, error: "EMPRESA_ID_REQUIRED" }, cors);
    }
  } else {
    try {
      empresaId = await resolveEmpresaIdFallback(baseUser);
    } catch {
      return json(400, { ok: false, error: "EMPRESA_ID_REQUIRED" }, cors);
    }
  }

  const user = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-empresa-id": empresaId,
        "x-revo-request-id": requestId,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const allowed = await hasPermissionOrOwnerAdmin(user, svc, callerId, empresaId, "ecommerce", "manage");
  if (!allowed) return json(403, { ok: false, error: "FORBIDDEN" }, cors);

  try {
    if (action === "stores.list") {
      const { data, error } = await svc
        .from("integrations_woocommerce_store")
        .select("id,base_url,auth_mode,status,last_healthcheck_at,created_at,updated_at")
        .eq("empresa_id", empresaId)
        .order("updated_at", { ascending: false });
      if (error) {
        await svc.from("woocommerce_sync_log").insert({
          empresa_id: empresaId,
          store_id: null,
          level: "error",
          message: "stores_list_failed",
          meta: sanitizeForLog({
            request_id: requestId,
            action,
            error: error.message ?? String(error),
          }),
        }).catch(() => null);
        throw error;
      }
      return json(200, { ok: true, stores: data ?? [] }, cors);
    }

    if (action === "stores.create") {
      const baseUrl = normalizeWooStoreUrl(body?.base_url);
      const authMode = (String(body?.auth_mode ?? "basic_https").trim() || "basic_https") as
        "basic_https" | "oauth1" | "querystring_fallback";
      const ck = String(body?.consumer_key ?? "").trim();
      const cs = String(body?.consumer_secret ?? "").trim();
      if (!ck || !cs) return json(400, { ok: false, error: "CREDENTIALS_REQUIRED" }, cors);

      const storeId = crypto.randomUUID();
      const aad = `${empresaId}:${storeId}`;
      const consumerKeyEnc = await aesGcmEncryptToString({ masterKey, plaintext: ck, aad });
      const consumerSecretEnc = await aesGcmEncryptToString({ masterKey, plaintext: cs, aad });

      const { data: created, error } = await svc.from("integrations_woocommerce_store").insert({
        id: storeId,
        empresa_id: empresaId,
        base_url: baseUrl,
        auth_mode: authMode,
        status: "active",
        consumer_key_enc: consumerKeyEnc,
        consumer_secret_enc: consumerSecretEnc,
      }).select("id,base_url,auth_mode,status,created_at").single();
      if (error) throw error;
      return json(200, { ok: true, store: created }, cors);
    }

    const storeId = String(body?.store_id ?? "").trim();
    if (!storeId) return json(400, { ok: false, error: "STORE_ID_REQUIRED" }, cors);

    const { data: store, error: storeErr } = await svc
      .from("integrations_woocommerce_store")
      .select("id,empresa_id,base_url,auth_mode,consumer_key_enc,consumer_secret_enc,webhook_secret_enc,status,last_healthcheck_at")
      .eq("id", storeId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (storeErr || !store?.id) return json(404, { ok: false, error: "STORE_NOT_FOUND" }, cors);

    const baseUrl = normalizeWooStoreUrl(String(store.base_url));
    const authMode = (String(store.auth_mode ?? "basic_https") as "basic_https" | "oauth1" | "querystring_fallback") || "basic_https";
    const aad = `${empresaId}:${storeId}`;
    let consumerKey = "";
    let consumerSecret = "";
    const needsWooCredentials = action === "stores.healthcheck" ||
      action === "stores.webhooks.register" ||
      action === "stores.products.search" ||
      action === "stores.catalog.preview.import" ||
      action === "stores.catalog.run.import";
    if (needsWooCredentials) {
      consumerKey = await aesGcmDecryptFromString({ masterKey, ciphertext: String(store.consumer_key_enc), aad });
      consumerSecret = await aesGcmDecryptFromString({ masterKey, ciphertext: String(store.consumer_secret_enc), aad });
    }

    if (action === "stores.healthcheck") {
      const { url, headers } = buildWooApiUrl({
        baseUrl,
        path: "products",
        authMode,
        consumerKey,
        consumerSecret,
        query: { per_page: "1", page: "1" },
        userAgent: "UltriaERP/woocommerce-admin",
      });
      const resp = await wooFetchJson(url, { headers });
      const ok = resp.ok;
      const classification = classifyWooHttpStatus(resp.status);
      await svc.from("integrations_woocommerce_store").update({
        last_healthcheck_at: new Date().toISOString(),
        status: ok ? "active" : classification.pauseStore ? "paused" : "error",
      }).eq("id", storeId).eq("empresa_id", empresaId);

      if (!ok) {
        await logWooEvent({
          svc,
          empresaId,
          storeId,
          code: classification.code,
          context: "healthcheck_failed",
          meta: { http_status: resp.status, details: sanitizeForLog(resp.data) },
        });
      }

      return json(200, {
        ok: true,
        status: ok ? "ok" : "error",
        http_status: resp.status,
        error_code: ok ? null : classification.code,
        hint: ok ? null : classification.hint,
        details: ok ? null : sanitizeForLog(resp.data),
      }, cors);
    }

    if (action === "stores.webhooks.register") {
      const secretPlain = randomSecretBase64(32);
      const webhookSecretEnc = await aesGcmEncryptToString({ masterKey, plaintext: secretPlain, aad });
      await svc.from("integrations_woocommerce_store").update({ webhook_secret_enc: webhookSecretEnc }).eq("id", storeId).eq("empresa_id", empresaId);

      const deliveryUrl = `${supabaseUrl}/functions/v1/woocommerce-webhook/${storeId}`;
      const topics = Array.isArray(body?.topics) && body.topics.length ? body.topics : ["order.created", "order.updated"];

      const created: any[] = [];
      for (const topic of topics) {
        const { url, headers } = buildWooApiUrl({
          baseUrl,
          path: "webhooks",
          authMode,
          consumerKey,
          consumerSecret,
          userAgent: "UltriaERP/woocommerce-admin",
        });
        const resp = await wooFetchJson(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Revo ERP - ${topic}`,
            topic,
            delivery_url: deliveryUrl,
            secret: secretPlain,
            status: "active",
          }),
        });
        if (!resp.ok) {
          const classification = classifyWooHttpStatus(resp.status);
          await logWooEvent({
            svc,
            empresaId,
            storeId,
            code: classification.code,
            context: "webhook_register_failed",
            meta: { topic, http_status: resp.status, details: sanitizeForLog(resp.data) },
          });
          return json(502, { ok: false, error: "WEBHOOK_CREATE_FAILED", topic, status: resp.status, details: sanitizeForLog(resp.data) }, cors);
        }
        created.push({ topic, id: resp.data?.id ?? null });
      }

      return json(200, { ok: true, delivery_url: deliveryUrl, topics: created }, cors);
    }

    if (action === "stores.products.search") {
      const page = Math.max(1, Math.min(Number(body?.page ?? 1), 1000));
      const perPage = Math.max(1, Math.min(Number(body?.per_page ?? 50), 100));
      const q = String(body?.query ?? "").trim();
      const statusFilter = String(body?.status ?? "").trim();
      const query: Record<string, string> = {
        page: String(page),
        per_page: String(perPage),
        orderby: "modified",
        order: "desc",
      };
      if (q) query.search = q;
      if (statusFilter) query.status = statusFilter;

      const { url, headers } = buildWooApiUrl({
        baseUrl,
        path: "products",
        authMode,
        consumerKey,
        consumerSecret,
        query,
        userAgent: "UltriaERP/woocommerce-admin",
      });
      const resp = await wooFetchJson(url, { headers });
      if (!resp.ok) {
        const classification = classifyWooHttpStatus(resp.status);
        return json(502, {
          ok: false,
          error: "WOO_PRODUCTS_SEARCH_FAILED",
          error_code: classification.code,
          hint: classification.hint,
          details: sanitizeForLog(resp.data),
        }, cors);
      }

      const rows = (Array.isArray(resp.data) ? resp.data : []).map((row: any) => ({
        id: Number(row?.id ?? 0) || null,
        name: String(row?.name ?? "").trim() || null,
        sku: String(row?.sku ?? "").trim() || null,
        type: String(row?.type ?? "simple"),
        status: String(row?.status ?? "").trim() || null,
        price: String(row?.regular_price ?? row?.price ?? "").trim() || null,
        stock_status: String(row?.stock_status ?? "").trim() || null,
        updated_at: row?.date_modified_gmt ?? row?.date_modified ?? null,
      }));

      return json(200, { ok: true, page, per_page: perPage, rows }, cors);
    }

    if (action === "stores.product_map.build") {
      const jobId = await user.rpc("woocommerce_sync_job_enqueue", {
        p_store_id: storeId,
        p_type: "CATALOG_RECONCILE",
        p_payload: { action: "build_product_map" },
        p_dedupe_key: `build_product_map:${new Date().toISOString().slice(0, 10)}`,
        p_next_run_at: new Date().toISOString(),
      }).then((r: any) => r.data as string).catch(() => null);

      let worker: any = null;
      if (workerKey) worker = await workerInvoke({ supabaseUrl, workerKey, storeId, limit: 10 });
      return json(200, { ok: true, enqueued_job_id: jobId, worker }, cors);
    }

    if (action === "stores.product_map.list") {
      const limit = Math.min(Math.max(Number(body?.limit ?? 100), 1), 200);
      const { data, error } = await svc
        .from("woocommerce_product_map")
        .select("id,sku,revo_product_id,woo_product_id,woo_variation_id,last_synced_stock_at,last_synced_price_at,updated_at")
        .eq("empresa_id", empresaId)
        .eq("store_id", storeId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json(200, { ok: true, rows: data ?? [] }, cors);
    }

    if (action === "stores.listings.by_products") {
      const ids = Array.isArray(body?.revo_product_ids)
        ? body.revo_product_ids.map((id: any) => String(id ?? "").trim()).filter(Boolean)
        : [];
      if (ids.length === 0) return json(200, { ok: true, rows: [] }, cors);
      const { data, error } = await svc
        .from("woocommerce_listing")
        .select("id,revo_product_id,sku,woo_product_id,woo_variation_id,listing_status,last_sync_price_at,last_sync_stock_at,last_error_code,last_error_hint,updated_at")
        .eq("empresa_id", empresaId)
        .eq("store_id", storeId)
        .in("revo_product_id", ids);
      if (error) throw error;
      return json(200, { ok: true, rows: data ?? [] }, cors);
    }

    if (action === "stores.listings.by_product") {
      const revoProductId = String(body?.revo_product_id ?? "").trim();
      if (!revoProductId) return json(400, { ok: false, error: "REVO_PRODUCT_ID_REQUIRED" }, cors);
      const { data, error } = await svc
        .from("woocommerce_listing")
        .select("id,revo_product_id,sku,woo_product_id,woo_variation_id,listing_status,last_sync_price_at,last_sync_stock_at,last_error_code,last_error_hint,updated_at")
        .eq("empresa_id", empresaId)
        .eq("store_id", storeId)
        .eq("revo_product_id", revoProductId)
        .maybeSingle();
      if (error) throw error;
      return json(200, { ok: true, listing: data ?? null }, cors);
    }

    if (action === "stores.listings.link_by_sku") {
      const revoProductId = String(body?.revo_product_id ?? "").trim();
      const sku = normalizeSku(body?.sku);
      if (!revoProductId || !sku) return json(400, { ok: false, error: "REVO_PRODUCT_ID_AND_SKU_REQUIRED" }, cors);

      const { data: maps, error: mapErr } = await svc
        .from("woocommerce_product_map")
        .select("sku,woo_product_id,woo_variation_id,revo_product_id")
        .eq("empresa_id", empresaId)
        .eq("store_id", storeId)
        .eq("sku", sku);
      if (mapErr) throw mapErr;
      const rows = Array.isArray(maps) ? maps : [];
      if (rows.length === 0) {
        return json(404, { ok: false, error: "SKU_NOT_FOUND_IN_WOO_MAP" }, cors);
      }
      if (rows.length > 1) {
        await upsertListingByMap({
          svc,
          empresaId,
          storeId,
          revoProductId,
          sku,
          wooProductId: null,
          wooVariationId: null,
          listingStatus: "conflict",
          lastErrorCode: "WOO_DUPLICATE_SKU",
          lastErrorHint: "SKU duplicado no Woo. Resolva o conflito no catálogo antes de vincular.",
        });
        return json(409, { ok: false, error: "WOO_DUPLICATE_SKU" }, cors);
      }

      const map = rows[0];
      await svc
        .from("woocommerce_product_map")
        .update({ revo_product_id: revoProductId, updated_at: new Date().toISOString() })
        .eq("empresa_id", empresaId)
        .eq("store_id", storeId)
        .eq("sku", sku);
      await upsertListingByMap({
        svc,
        empresaId,
        storeId,
        revoProductId,
        sku,
        wooProductId: Number(map?.woo_product_id ?? 0) || null,
        wooVariationId: Number(map?.woo_variation_id ?? 0) || null,
        listingStatus: "linked",
      });

      return json(200, { ok: true, status: "linked" }, cors);
    }

    if (action === "stores.listings.unlink") {
      const revoProductId = String(body?.revo_product_id ?? "").trim();
      if (!revoProductId) return json(400, { ok: false, error: "REVO_PRODUCT_ID_REQUIRED" }, cors);
      await svc
        .from("woocommerce_listing")
        .upsert({
          empresa_id: empresaId,
          store_id: storeId,
          revo_product_id: revoProductId,
          sku: null,
          woo_product_id: null,
          woo_variation_id: null,
          listing_status: "unlinked",
          last_error_code: null,
          last_error_hint: null,
        }, { onConflict: "store_id,revo_product_id" });
      await svc
        .from("woocommerce_product_map")
        .update({ revo_product_id: null, updated_at: new Date().toISOString() })
        .eq("empresa_id", empresaId)
        .eq("store_id", storeId)
        .eq("revo_product_id", revoProductId);
      return json(200, { ok: true, status: "unlinked" }, cors);
    }

    if (action === "stores.sync.stock" || action === "stores.sync.price") {
      const skus = Array.isArray(body?.skus) ? body.skus : [];
      const kind = action === "stores.sync.stock" ? "STOCK_SYNC" : "PRICE_SYNC";
      const dedupe = `${kind.toLowerCase()}:${new Date().toISOString().slice(0, 13)}`;
      const { data: jobId, error } = await user.rpc("woocommerce_sync_job_enqueue", {
        p_store_id: storeId,
        p_type: kind,
        p_payload: { skus: skus.map((s: any) => String(s ?? "").trim()).filter(Boolean) },
        p_dedupe_key: dedupe,
        p_next_run_at: new Date().toISOString(),
      });
      if (error) throw error;

      let worker: any = null;
      if (workerKey) worker = await workerInvoke({ supabaseUrl, workerKey, storeId, limit: 10 });
      return json(200, { ok: true, enqueued_job_id: jobId, worker }, cors);
    }

    if (action === "stores.reconcile.orders") {
      const orderId = body?.order_id != null ? Number(body.order_id) : null;
      if (!orderId || !Number.isFinite(orderId) || orderId <= 0) {
        return json(400, { ok: false, error: "ORDER_ID_REQUIRED" }, cors);
      }
      const dedupe = `order:${orderId}`;
      const { data: jobId, error } = await user.rpc("woocommerce_sync_job_enqueue", {
        p_store_id: storeId,
        p_type: "ORDER_RECONCILE",
        p_payload: { order_id: orderId },
        p_dedupe_key: dedupe,
        p_next_run_at: new Date().toISOString(),
      });
      if (error) throw error;

      let worker: any = null;
      if (workerKey) worker = await workerInvoke({ supabaseUrl, workerKey, storeId, limit: 10 });
      return json(200, { ok: true, enqueued_job_id: jobId, worker }, cors);
    }

    if (
      action === "stores.catalog.preview.export" ||
      action === "stores.catalog.preview.sync_price" ||
      action === "stores.catalog.preview.sync_stock"
    ) {
      const revoProductIds = Array.isArray(body?.revo_product_ids) ? body.revo_product_ids : [];
      const skus = Array.isArray(body?.skus) ? body.skus : [];
      const products = await loadRevoProductsForCatalog({
        svc,
        empresaId,
        revoProductIds,
        skus,
      });

      const productSkus = products.map((p: any) => normalizeSku(p?.sku)).filter(Boolean);
      const mapRows = await loadStoreMapBySku({
        svc,
        empresaId,
        storeId,
        skus: productSkus,
      });
      const mode: "EXPORT" | "SYNC_PRICE" | "SYNC_STOCK" = action === "stores.catalog.preview.export"
        ? "EXPORT"
        : action === "stores.catalog.preview.sync_price"
        ? "SYNC_PRICE"
        : "SYNC_STOCK";
      const items = buildExportPreview({ products, mapRows, mode });
      return json(200, {
        ok: true,
        mode,
        summary: summarizePreview(items),
        items,
      }, cors);
    }

    if (
      action === "stores.catalog.run.export" ||
      action === "stores.catalog.run.sync_price" ||
      action === "stores.catalog.run.sync_stock"
    ) {
      const mode: CatalogRunType = action === "stores.catalog.run.export"
        ? "EXPORT"
        : action === "stores.catalog.run.sync_price"
        ? "SYNC_PRICE"
        : "SYNC_STOCK";
      const previewAction = action === "stores.catalog.run.export"
        ? "stores.catalog.preview.export"
        : action === "stores.catalog.run.sync_price"
        ? "stores.catalog.preview.sync_price"
        : "stores.catalog.preview.sync_stock";
      const revoProductIds = Array.isArray(body?.revo_product_ids) ? body.revo_product_ids : [];
      const skus = Array.isArray(body?.skus) ? body.skus : [];
      const products = await loadRevoProductsForCatalog({ svc, empresaId, revoProductIds, skus });
      const productSkus = products.map((p: any) => normalizeSku(p?.sku)).filter(Boolean);
      const mapRows = await loadStoreMapBySku({ svc, empresaId, storeId, skus: productSkus });
      const previewItems = buildExportPreview({
        products,
        mapRows,
        mode: mode === "EXPORT" ? "EXPORT" : mode === "SYNC_PRICE" ? "SYNC_PRICE" : "SYNC_STOCK",
      });
      const runId = await createRunWithItems({
        svc,
        empresaId,
        storeId,
        runType: mode,
        callerId,
        options: {
          source_action: previewAction,
          options: sanitizeForLog(body?.options ?? {}),
        },
        previewItems,
      });

      const runnable = previewItems.filter((item) => item.action === "CREATE" || item.action === "UPDATE");
      const runPayload: Record<string, unknown> = {
        run_id: runId,
        skus: runnable.map((item) => item.sku).filter(Boolean),
        options: sanitizeForLog(body?.options ?? {}),
      };
      const enqueuedJobId = runnable.length > 0
        ? await enqueueRunJob({ user, storeId, runType: mode, payload: runPayload })
        : null;

      if (runnable.length === 0) {
        await svc
          .from("woocommerce_sync_run")
          .update({
            status: "error",
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            summary: {
              planned: previewItems.length,
              updated: 0,
              skipped: previewItems.filter((item) => item.action === "SKIP").length,
              failed: previewItems.filter((item) => item.action === "BLOCK").length,
            },
          })
          .eq("id", runId)
          .eq("empresa_id", empresaId)
          .eq("store_id", storeId);
      }

      let worker: any = null;
      if (workerKey && runnable.length > 0) worker = await workerInvoke({ supabaseUrl, workerKey, storeId, limit: 20 });
      return json(200, {
        ok: true,
        run_id: runId,
        enqueued_job_id: enqueuedJobId,
        worker,
        summary: summarizePreview(previewItems),
      }, cors);
    }

    if (action === "stores.catalog.preview.import") {
      const wooProductIds = Array.isArray(body?.woo_product_ids)
        ? body.woo_product_ids.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
        : [];
      if (wooProductIds.length === 0) return json(400, { ok: false, error: "WOO_PRODUCT_IDS_REQUIRED" }, cors);

      const wooProducts: any[] = [];
      for (const wooProductId of wooProductIds) {
        const { url, headers } = buildWooApiUrl({
          baseUrl,
          path: `products/${wooProductId}`,
          authMode,
          consumerKey,
          consumerSecret,
          userAgent: "UltriaERP/woocommerce-admin",
        });
        const resp = await wooFetchJson(url, { headers });
        if (!resp.ok) {
          const classification = classifyWooHttpStatus(resp.status);
          return json(502, {
            ok: false,
            error: "WOO_IMPORT_PREVIEW_FAILED",
            error_code: classification.code,
            hint: classification.hint,
            details: sanitizeForLog(resp.data),
          }, cors);
        }
        wooProducts.push(resp.data);
      }

      const skus = wooProducts.map((woo) => normalizeSku(woo?.sku)).filter(Boolean);
      const revoRows = await loadRevoProductsForCatalog({ svc, empresaId, revoProductIds: [], skus });
      const mapRows = await loadStoreMapBySku({ svc, empresaId, storeId, skus });
      const revoBySku = new Map<string, any>();
      for (const row of revoRows) {
        revoBySku.set(normalizeSkuKey(row?.sku), row);
      }
      const mapBySku = new Map<string, any[]>();
      for (const row of mapRows) {
        const key = normalizeSkuKey(row?.sku);
        const list = mapBySku.get(key) ?? [];
        list.push(row);
        mapBySku.set(key, list);
      }
      const items = buildImportPreview({ wooProducts, revoBySku, mapBySku });
      return json(200, { ok: true, mode: "IMPORT", summary: summarizePreview(items), items }, cors);
    }

    if (action === "stores.catalog.run.import") {
      const wooProductIds = Array.isArray(body?.woo_product_ids)
        ? body.woo_product_ids.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
        : [];
      if (wooProductIds.length === 0) return json(400, { ok: false, error: "WOO_PRODUCT_IDS_REQUIRED" }, cors);

      const wooProducts: any[] = [];
      for (const wooProductId of wooProductIds) {
        const { url, headers } = buildWooApiUrl({
          baseUrl,
          path: `products/${wooProductId}`,
          authMode,
          consumerKey,
          consumerSecret,
          userAgent: "UltriaERP/woocommerce-admin",
        });
        const resp = await wooFetchJson(url, { headers });
        if (!resp.ok) {
          const classification = classifyWooHttpStatus(resp.status);
          return json(502, {
            ok: false,
            error: "WOO_IMPORT_PREVIEW_FAILED",
            error_code: classification.code,
            hint: classification.hint,
            details: sanitizeForLog(resp.data),
          }, cors);
        }
        wooProducts.push(resp.data);
      }

      const skus = wooProducts.map((woo) => normalizeSku(woo?.sku)).filter(Boolean);
      const revoRows = await loadRevoProductsForCatalog({ svc, empresaId, revoProductIds: [], skus });
      const mapRows = await loadStoreMapBySku({ svc, empresaId, storeId, skus });
      const revoBySku = new Map<string, any>();
      for (const row of revoRows) revoBySku.set(normalizeSkuKey(row?.sku), row);
      const mapBySku = new Map<string, any[]>();
      for (const row of mapRows) {
        const key = normalizeSkuKey(row?.sku);
        const list = mapBySku.get(key) ?? [];
        list.push(row);
        mapBySku.set(key, list);
      }
      const previewItems = buildImportPreview({ wooProducts, revoBySku, mapBySku });
      const runId = await createRunWithItems({
        svc,
        empresaId,
        storeId,
        runType: "IMPORT",
        callerId,
        options: {
          woo_product_ids: wooProductIds,
          options: sanitizeForLog(body?.options ?? {}),
        },
        previewItems,
      });

      const runnableWooIds = previewItems
        .filter((item) => item.action === "CREATE" || item.action === "UPDATE")
        .map((item) => Number(item.woo_product_id ?? 0))
        .filter((value) => Number.isFinite(value) && value > 0);
      const enqueuedJobId = runnableWooIds.length > 0
        ? await enqueueRunJob({
          user,
          storeId,
          runType: "IMPORT",
          payload: {
            run_id: runId,
            woo_product_ids: runnableWooIds,
            options: sanitizeForLog(body?.options ?? {}),
          },
        })
        : null;

      let worker: any = null;
      if (workerKey && runnableWooIds.length > 0) worker = await workerInvoke({ supabaseUrl, workerKey, storeId, limit: 20 });
      return json(200, {
        ok: true,
        run_id: runId,
        enqueued_job_id: enqueuedJobId,
        worker,
        summary: summarizePreview(previewItems),
      }, cors);
    }

    if (action === "stores.status") {
      const [events, jobs, logs, queued, running, errored, dead, mapQuality, orderTotal, orderLatest, recentRuns] = await Promise.all([
        svc.from("woocommerce_webhook_event").select("id,process_status,received_at,topic,woo_resource_id,last_error,error_code").eq("empresa_id", empresaId).eq("store_id", storeId).order("received_at", { ascending: false }).limit(20),
        svc.from("woocommerce_sync_job").select("id,type,status,attempts,next_run_at,last_error,created_at").eq("empresa_id", empresaId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(20),
        svc.from("woocommerce_sync_log").select("id,level,message,meta,created_at,job_id").eq("empresa_id", empresaId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(50),
        countByStatus(svc, empresaId, storeId, "queued"),
        countByStatus(svc, empresaId, storeId, "running"),
        countByStatus(svc, empresaId, storeId, "error"),
        countByStatus(svc, empresaId, storeId, "dead"),
        mapQualitySnapshot(svc, empresaId, storeId),
        countOrderMap(svc, empresaId, storeId),
        latestOrderMapRow(svc, empresaId, storeId),
        svc.from("woocommerce_sync_run").select("id,type,status,summary,created_at,started_at,finished_at").eq("empresa_id", empresaId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(5),
      ]);

      const statusContract = buildWooStoreStatusContract({
        store: {
          id: storeId,
          status: store.status,
          base_url: baseUrl,
          auth_mode: authMode,
          last_healthcheck_at: store.last_healthcheck_at ?? null,
        },
        queueCounts: { queued, running, error: errored, dead },
        mapQuality,
        webhookEvents: events.data ?? [],
        jobs: jobs.data ?? [],
        logs: logs.data ?? [],
        orderMapLatest: orderLatest,
      });
      statusContract.orders.imported_total_seen = orderTotal;

      return json(200, {
        ok: true,
        store: { id: storeId, base_url: baseUrl, auth_mode: authMode, status: store.status },
        webhook_events: events.data ?? [],
        jobs: jobs.data ?? [],
        logs: logs.data ?? [],
        health: statusContract.health,
        queue: statusContract.queue,
        webhooks: statusContract.webhooks,
        orders: statusContract.orders,
        map_quality: statusContract.map_quality,
        recommendations: statusContract.recommendations,
        recent_errors: statusContract.recent_errors,
        status_contract: statusContract,
        recent_runs: recentRuns.data ?? [],
      }, cors);
    }

    if (action === "stores.runs.list") {
      const limit = Math.max(1, Math.min(Number(body?.limit ?? 30), 100));
      const runs = await listRuns({ svc, empresaId, storeId, limit });
      return json(200, { ok: true, runs }, cors);
    }

    if (action === "stores.runs.get") {
      const runId = String(body?.run_id ?? "").trim();
      if (!runId) return json(400, { ok: false, error: "RUN_ID_REQUIRED" }, cors);
      const details = await fetchRunWithItems({
        svc,
        empresaId,
        storeId,
        runId,
        limitItems: Number(body?.limit_items ?? 400),
      });
      if (!details) return json(404, { ok: false, error: "RUN_NOT_FOUND" }, cors);
      return json(200, { ok: true, run: details.run, items: details.items }, cors);
    }

    if (action === "stores.runs.retry_failed") {
      const runId = String(body?.run_id ?? "").trim();
      if (!runId) return json(400, { ok: false, error: "RUN_ID_REQUIRED" }, cors);
      const details = await fetchRunWithItems({
        svc,
        empresaId,
        storeId,
        runId,
        limitItems: 1000,
      });
      if (!details) return json(404, { ok: false, error: "RUN_NOT_FOUND" }, cors);

      const sourceRun = details.run as any;
      const failedItems = details.items.filter((item: any) => String(item.status) === "ERROR" || String(item.status) === "DEAD");
      if (failedItems.length === 0) {
        return json(400, { ok: false, error: "RUN_HAS_NO_FAILED_ITEMS" }, cors);
      }

      const retryPreview: CatalogPreviewItem[] = failedItems.map((item: any) => ({
        sku: item.sku ? String(item.sku) : null,
        revo_product_id: item.revo_product_id ? String(item.revo_product_id) : null,
        woo_product_id: item.woo_product_id != null ? Number(item.woo_product_id) || null : null,
        woo_variation_id: item.woo_variation_id != null ? Number(item.woo_variation_id) || null : null,
        action: (String(item.action ?? "UPDATE").toUpperCase() as CatalogItemAction),
        warnings: [],
        blockers: [],
        diff: item.diff ?? {},
      }));

      const retryRunType = String(sourceRun?.type ?? "").trim() as CatalogRunType;
      const newRunId = await createRunWithItems({
        svc,
        empresaId,
        storeId,
        runType: retryRunType,
        callerId,
        options: {
          source_run_id: runId,
          retry_only_failed: true,
        },
        previewItems: retryPreview,
      });

      const runPayload: Record<string, unknown> = {
        run_id: newRunId,
        skus: retryPreview.map((item) => item.sku).filter(Boolean),
        woo_product_ids: retryPreview.map((item) => item.woo_product_id).filter((id) => Number(id) > 0),
        source_run_id: runId,
        retry_only_failed: true,
      };
      const enqueuedJobId = await enqueueRunJob({ user, storeId, runType: retryRunType, payload: runPayload });

      let worker: any = null;
      if (workerKey) worker = await workerInvoke({ supabaseUrl, workerKey, storeId, limit: 20 });
      return json(200, {
        ok: true,
        run_id: newRunId,
        source_run_id: runId,
        enqueued_job_id: enqueuedJobId,
        retried_items: retryPreview.length,
        worker,
      }, cors);
    }

    if (action === "stores.pause" || action === "stores.unpause") {
      const nextStatus = action === "stores.pause" ? "paused" : "active";
      const { error } = await svc
        .from("integrations_woocommerce_store")
        .update({ status: nextStatus })
        .eq("id", storeId)
        .eq("empresa_id", empresaId);
      if (error) throw error;
      await logWooEvent({
        svc,
        empresaId,
        storeId,
        code: "WOO_UNEXPECTED",
        context: action === "stores.pause" ? "store_paused_by_admin" : "store_unpaused_by_admin",
        level: "info",
        meta: { requested_status: nextStatus, requested_by: callerId },
      });
      return json(200, { ok: true, status: nextStatus }, cors);
    }

    if (action === "stores.worker.run") {
      if (!workerKey) {
        return json(400, { ok: false, error: "WORKER_KEY_NOT_CONFIGURED" }, cors);
      }
      const limit = Math.min(Math.max(Number(body?.limit ?? 25), 1), 100);
      const worker = await workerInvoke({ supabaseUrl, workerKey, storeId, limit });
      if (!worker?.ok) {
        await logWooEvent({
          svc,
          empresaId,
          storeId,
          code: "WOO_WORKER_INVOKE_FAILED",
          context: "worker_run_failed",
          meta: { worker: sanitizeForLog(worker) },
        });
        return json(502, { ok: false, error: "WORKER_RUN_FAILED", worker }, cors);
      }
      return json(200, { ok: true, worker }, cors);
    }

    if (action === "stores.jobs.requeue") {
      const jobId = String(body?.job_id ?? "").trim();
      if (!jobId) return json(400, { ok: false, error: "JOB_ID_REQUIRED" }, cors);

      const { data: job, error: jobErr } = await svc
        .from("woocommerce_sync_job")
        .select("id,status,type,attempts,max_attempts")
        .eq("id", jobId)
        .eq("empresa_id", empresaId)
        .eq("store_id", storeId)
        .maybeSingle();
      if (jobErr || !job?.id) return json(404, { ok: false, error: "JOB_NOT_FOUND" }, cors);
      if (String(job.status) !== "dead") {
        return json(400, { ok: false, error: "JOB_NOT_DEAD", status: job.status }, cors);
      }

      const { error: updErr } = await svc
        .from("woocommerce_sync_job")
        .update({
          status: "queued",
          attempts: 0,
          locked_at: null,
          lock_owner: null,
          last_error: null,
          next_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("empresa_id", empresaId)
        .eq("store_id", storeId);
      if (updErr) throw updErr;

      await logWooEvent({
        svc,
        empresaId,
        storeId,
        code: "JOB_FAILED",
        context: "job_requeued_by_admin",
        level: "info",
        meta: {
          job_id: jobId,
          job_type: job.type,
          previous_attempts: Number(job.attempts ?? 0),
          previous_max_attempts: Number(job.max_attempts ?? 0),
          requested_by: callerId,
        },
      });

      let worker: any = null;
      if (workerKey) worker = await workerInvoke({ supabaseUrl, workerKey, storeId, limit: 10 });
      return json(200, { ok: true, job_id: jobId, status: "queued", worker }, cors);
    }

    return json(400, { ok: false, error: "ACTION_NOT_SUPPORTED" }, cors);
  } catch (e: any) {
    const message = String(e?.message ?? "UNEXPECTED_ERROR");
    const code = detectWooErrorCode(message);
    const resolved = resolveWooError(code);
    return json(500, {
      ok: false,
      error: message,
      error_code: resolved.code,
      hint: resolved.hint,
    }, cors);
  }
});
