import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { aesGcmDecryptFromString, timingSafeEqual } from "../_shared/crypto.ts";
import { getRequestId } from "../_shared/request.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { detectWooErrorCode, resolveWooError } from "../_shared/woocommerceErrors.ts";
import {
  buildWooApiUrl,
  classifyWooHttpStatus,
  computeBackoffMs,
  normalizeWooStoreUrl,
  parsePositiveIntEnv,
  pickUniqueByStoreType,
  type ClassifiedWooError,
  type WooAuthMode,
} from "../_shared/woocommerceHardening.ts";

type JobRow = {
  id: string;
  empresa_id: string;
  store_id: string;
  type: "PRICE_SYNC" | "STOCK_SYNC" | "ORDER_RECONCILE" | "CATALOG_RECONCILE" | "CATALOG_EXPORT" | "CATALOG_IMPORT";
  payload: any;
  attempts: number;
  max_attempts: number;
};

type StoreSecrets = {
  empresaId: string;
  storeId: string;
  baseUrl: string;
  authMode: WooAuthMode;
  consumerKey: string;
  consumerSecret: string;
};

class WooRequestError extends Error {
  status: number;
  code: ClassifiedWooError["code"];
  retryable: boolean;
  pauseStore: boolean;
  hint: string;

  constructor(status: number, shape: ClassifiedWooError) {
    super(`${shape.code}:${status}`);
    this.status = status;
    this.code = shape.code;
    this.retryable = shape.retryable;
    this.pauseStore = shape.pauseStore;
    this.hint = shape.hint;
  }
}

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toWooPrice(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function toWooStockQuantity(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function toWooStatusFromRevo(status: string): "publish" | "draft" {
  return String(status ?? "").trim() === "ativo" ? "publish" : "draft";
}

function mapWooOrderStatus(order: any): "orcamento" | "aprovado" | "cancelado" {
  const status = String(order?.status ?? "").toLowerCase();
  const hasPaidDate = !!order?.date_paid;
  if (["cancelled", "failed", "refunded", "trash"].includes(status)) return "cancelado";
  if (["completed", "processing"].includes(status) || hasPaidDate) return "aprovado";
  return "orcamento";
}

function chooseNextPedidoStatus(current: string | null, desired: string): string {
  const cur = String(current ?? "").trim();
  if (!cur) return desired;
  if (cur === "cancelado") return "cancelado";
  return desired;
}

async function wooFetchJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any; headers: Headers }> {
  const resp = await fetch(url, {
    ...(init ?? {}),
    headers: {
      ...(init?.headers ?? {}),
      Accept: "application/json",
      "User-Agent": "UltriaERP/woocommerce-worker",
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data, headers: resp.headers };
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (e instanceof WooRequestError && !e.retryable) throw e;
      const wait = Math.min(60_000, 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
      await sleep(wait);
    }
  }
  throw lastErr ?? new Error("RETRY_FAILED");
}

async function wooRequestJson(params: {
  url: string;
  init?: RequestInit;
}): Promise<{ status: number; data: any; headers: Headers }> {
  const resp = await wooFetchJson(params.url, params.init);
  if (resp.ok) return { status: resp.status, data: resp.data, headers: resp.headers };
  throw new WooRequestError(resp.status, classifyWooHttpStatus(resp.status));
}

async function loadStoreSecrets(params: {
  svc: any;
  masterKey: string;
  storeId: string;
}): Promise<StoreSecrets> {
  const { svc, masterKey, storeId } = params;
  const { data: store, error } = await svc
    .from("integrations_woocommerce_store")
    .select("id,empresa_id,base_url,auth_mode,consumer_key_enc,consumer_secret_enc,status")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !store?.id || !store?.empresa_id) throw new Error("STORE_NOT_FOUND");
  if (String(store.status) !== "active") throw new Error("STORE_NOT_ACTIVE");

  const empresaId = String(store.empresa_id);
  const baseUrl = normalizeWooStoreUrl(String(store.base_url));
  const aad = `${empresaId}:${storeId}`;
  const consumerKey = await aesGcmDecryptFromString({ masterKey, ciphertext: String(store.consumer_key_enc), aad });
  const consumerSecret = await aesGcmDecryptFromString({ masterKey, ciphertext: String(store.consumer_secret_enc), aad });

  return {
    empresaId,
    storeId,
    baseUrl,
    authMode: (String(store.auth_mode ?? "basic_https") as WooAuthMode) || "basic_https",
    consumerKey,
    consumerSecret,
  };
}

async function ensureWooBuyerAsPartner(svc: any, empresaId: string, order: any): Promise<string> {
  const billing = order?.billing ?? {};
  const email = String(billing?.email ?? "").trim();
  const externalIdRaw = order?.customer_id != null && Number(order.customer_id) > 0
    ? `woo:customer:${String(order.customer_id)}`
    : email ? `woo:guest:${email.toLowerCase()}` : null;

  const name = [billing?.first_name, billing?.last_name].filter(Boolean).join(" ").trim() ||
    `Cliente Woo ${String(order?.id ?? "").trim() || "sem-id"}`;

  if (externalIdRaw) {
    const { data: existing } = await svc
      .from("pessoas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("codigo_externo", externalIdRaw)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) return String(existing.id);
  }

  const { data: created, error } = await svc.from("pessoas").insert({
    empresa_id: empresaId,
    tipo: "cliente",
    nome: name,
    email: email || null,
    telefone: String(billing?.phone ?? "").trim() || null,
    doc_unico: null,
    codigo_externo: externalIdRaw,
    tipo_pessoa: "fisica",
  }).select("id").single();
  if (error) throw error;
  return String(created.id);
}

async function findProductIdBySku(svc: any, empresaId: string, sku: string): Promise<string | null> {
  const s = String(sku ?? "").trim();
  if (!s) return null;
  const { data } = await svc
    .from("produtos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("sku", s)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function upsertListing(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  revoProductId: string;
  sku: string | null;
  wooProductId: number | null;
  wooVariationId: number | null;
  listingStatus: "linked" | "unlinked" | "conflict" | "error";
  touchPrice?: boolean;
  touchStock?: boolean;
  errorCode?: string | null;
  errorHint?: string | null;
}) {
  const nowIso = new Date().toISOString();
  await params.svc.from("woocommerce_listing").upsert({
    empresa_id: params.empresaId,
    store_id: params.storeId,
    revo_product_id: params.revoProductId,
    sku: params.sku,
    woo_product_id: params.wooProductId,
    woo_variation_id: params.wooVariationId,
    listing_status: params.listingStatus,
    last_sync_price_at: params.touchPrice ? nowIso : null,
    last_sync_stock_at: params.touchStock ? nowIso : null,
    last_error_code: params.errorCode ?? null,
    last_error_hint: params.errorHint ?? null,
  }, { onConflict: "store_id,revo_product_id" });
}

async function updateRunItemStatus(params: {
  svc: any;
  itemId: string;
  empresaId: string;
  storeId: string;
  status: "DONE" | "ERROR" | "SKIPPED" | "RUNNING";
  errorCode?: string | null;
  hint?: string | null;
  lastError?: string | null;
}) {
  await params.svc
    .from("woocommerce_sync_run_item")
    .update({
      status: params.status,
      error_code: params.errorCode ?? null,
      hint: params.hint ?? null,
      last_error: params.lastError ?? null,
      last_error_at: params.status === "ERROR" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.itemId)
    .eq("empresa_id", params.empresaId)
    .eq("store_id", params.storeId);
}

async function refreshRunSummary(params: { svc: any; runId: string; empresaId: string; storeId: string }) {
  const { data: items } = await params.svc
    .from("woocommerce_sync_run_item")
    .select("status")
    .eq("run_id", params.runId)
    .eq("empresa_id", params.empresaId)
    .eq("store_id", params.storeId);
  const rows = Array.isArray(items) ? items : [];
  const planned = rows.length;
  const done = rows.filter((row: any) => String(row.status) === "DONE").length;
  const failed = rows.filter((row: any) => String(row.status) === "ERROR" || String(row.status) === "DEAD").length;
  const skipped = rows.filter((row: any) => String(row.status) === "SKIPPED").length;
  const running = rows.filter((row: any) => String(row.status) === "RUNNING" || String(row.status) === "QUEUED").length;
  const runStatus = running > 0
    ? "running"
    : failed > 0 && done > 0
    ? "partial"
    : failed > 0
    ? "error"
    : "done";
  await params.svc
    .from("woocommerce_sync_run")
    .update({
      status: runStatus,
      started_at: runStatus === "running" ? new Date().toISOString() : undefined,
      finished_at: running > 0 ? null : new Date().toISOString(),
      summary: {
        planned,
        updated: done,
        skipped,
        failed,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.runId)
    .eq("empresa_id", params.empresaId)
    .eq("store_id", params.storeId);
}

async function createOrUpdateRevoProductFromWoo(params: {
  svc: any;
  empresaId: string;
  woo: any;
}) {
  const sku = String(params.woo?.sku ?? "").trim();
  if (!sku) throw new Error("WOO_IMPORT_SKU_MISSING");
  const wooName = String(params.woo?.name ?? "").trim() || `Produto Woo ${String(params.woo?.id ?? "")}`;
  const wooStatus = String(params.woo?.status ?? "").trim() === "publish" ? "ativo" : "inativo";
  const wooPrice = Number(params.woo?.regular_price ?? params.woo?.price ?? 0) || 0;
  const wooStock = Number(params.woo?.stock_quantity ?? 0) || 0;

  const { data: existing } = await params.svc
    .from("produtos")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("sku", sku)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    await params.svc
      .from("produtos")
      .update({
        nome: wooName,
        status: wooStatus,
        preco_venda: wooPrice,
        estoque_atual: wooStock,
        descricao: String(params.woo?.short_description ?? params.woo?.description ?? "").slice(0, 1500) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", params.empresaId)
      .eq("id", String(existing.id));
    return { revoProductId: String(existing.id), created: false };
  }

  const insertPayload = {
    empresa_id: params.empresaId,
    tipo: "simples",
    status: wooStatus,
    nome: wooName,
    pode_comprar: true,
    pode_vender: true,
    pode_produzir: false,
    rastreio_lote: false,
    rastreio_serial: false,
    sku,
    unidade: "un",
    preco_venda: wooPrice,
    moeda: "BRL",
    icms_origem: 0,
    tipo_embalagem: "outro",
    controla_estoque: true,
    controlar_lotes: false,
    permitir_inclusao_vendas: true,
    descricao: String(params.woo?.short_description ?? params.woo?.description ?? "").slice(0, 1500) || null,
    estoque_atual: wooStock,
  };
  const { data: created, error } = await params.svc.from("produtos").insert(insertPayload).select("id").single();
  if (error || !created?.id) throw error ?? new Error("WOO_IMPORT_CREATE_FAILED");
  return { revoProductId: String(created.id), created: true };
}

async function upsertOrderIntoRevo(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  order: any;
}): Promise<{ revoOrderId: string; created: boolean; desiredStatus: string }> {
  const { svc, empresaId, storeId, order } = params;
  const wooOrderId = Number(order?.id ?? 0) || 0;
  if (!wooOrderId) throw new Error("ORDER_ID_MISSING");

  const desiredStatus = mapWooOrderStatus(order);
  const modifiedAtIso = String(order?.date_modified_gmt ?? order?.date_modified ?? order?.date_created ?? new Date().toISOString());
  const wooUpdatedAt = new Date(modifiedAtIso);
  if (Number.isNaN(wooUpdatedAt.getTime())) throw new Error("ORDER_DATE_INVALID");

  const { data: existingMap } = await svc
    .from("woocommerce_order_map")
    .select("revo_order_id,woo_updated_at,revo_status")
    .eq("empresa_id", empresaId)
    .eq("store_id", storeId)
    .eq("woo_order_id", wooOrderId)
    .maybeSingle();

  const prevUpdated = existingMap?.woo_updated_at ? new Date(String(existingMap.woo_updated_at)) : null;
  if (prevUpdated && prevUpdated.getTime() >= wooUpdatedAt.getTime() && existingMap?.revo_order_id) {
    return { revoOrderId: String(existingMap.revo_order_id), created: false, desiredStatus };
  }

  const clienteId = await ensureWooBuyerAsPartner(svc, empresaId, order);
  const createdAtIso = String(order?.date_created ?? new Date().toISOString());
  const dataEmissao = createdAtIso.slice(0, 10);
  const frete = Number(order?.shipping_total ?? 0) || 0;
  const desconto = Number(order?.discount_total ?? 0) || 0;

  const basePedido: any = {
    empresa_id: empresaId,
    cliente_id: clienteId,
    data_emissao: dataEmissao,
    frete,
    desconto,
    condicao_pagamento: null,
    observacoes: `WooCommerce #${wooOrderId}`,
    canal: "marketplace",
  };

  let pedidoId: string | null = existingMap?.revo_order_id ? String(existingMap.revo_order_id) : null;
  const isUpdate = !!pedidoId;

  if (pedidoId) {
    const { data: existingPedido } = await svc
      .from("vendas_pedidos")
      .select("status")
      .eq("empresa_id", empresaId)
      .eq("id", pedidoId)
      .maybeSingle();
    basePedido.status = chooseNextPedidoStatus(existingPedido?.status ? String(existingPedido.status) : null, desiredStatus);
    await svc.from("vendas_pedidos").update(basePedido).eq("empresa_id", empresaId).eq("id", pedidoId);
    await svc.from("vendas_itens_pedido").delete().eq("empresa_id", empresaId).eq("pedido_id", pedidoId);
  } else {
    basePedido.status = desiredStatus;
    const { data: created, error } = await svc.from("vendas_pedidos").insert(basePedido).select("id").single();
    if (error) throw error;
    pedidoId = String(created.id);
  }

  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  const itemsToInsert: any[] = [];
  let totalProdutos = 0;
  for (const it of lineItems) {
    const sku = String(it?.sku ?? "").trim();
    const produtoId = await findProductIdBySku(svc, empresaId, sku);
    if (!produtoId) continue;
    const qty = Number(it?.quantity ?? 0) || 0;
    const unit = Number(it?.price ?? it?.total ?? 0) || 0;
    const total = Math.max(0, qty * unit);
    totalProdutos += total;
    itemsToInsert.push({
      empresa_id: empresaId,
      pedido_id: pedidoId,
      produto_id: produtoId,
      quantidade: qty,
      preco_unitario: unit,
      desconto: 0,
      total,
      observacoes: null,
    });
  }
  if (itemsToInsert.length > 0) {
    const { error: itErr } = await svc.from("vendas_itens_pedido").insert(itemsToInsert);
    if (itErr) throw itErr;
  }

  const totalGeral = Math.max(0, totalProdutos + frete - desconto);
  await svc.from("vendas_pedidos").update({ total_produtos: totalProdutos, total_geral: totalGeral }).eq("empresa_id", empresaId).eq("id", pedidoId);

  await svc.from("woocommerce_order_map").upsert(
    {
      empresa_id: empresaId,
      store_id: storeId,
      woo_order_id: wooOrderId,
      revo_order_id: pedidoId,
      woo_status: String(order?.status ?? null),
      revo_status: basePedido.status,
      woo_updated_at: wooUpdatedAt.toISOString(),
      imported_at: new Date().toISOString(),
    },
    { onConflict: "store_id,woo_order_id" },
  );

  return { revoOrderId: pedidoId, created: !isUpdate, desiredStatus: basePedido.status };
}

async function buildProductMap(params: { svc: any; secrets: StoreSecrets; }): Promise<{ total: number; missingSku: number; duplicates: number; }> {
  const { svc, secrets } = params;
  const seen = new Map<string, number>();
  let total = 0;
  let missingSku = 0;
  let duplicates = 0;

  let page = 1;
  const perPage = 100;
  while (true) {
    const { url, headers } = buildWooApiUrl({
      baseUrl: secrets.baseUrl,
      path: "products",
      authMode: secrets.authMode,
      consumerKey: secrets.consumerKey,
      consumerSecret: secrets.consumerSecret,
      query: { per_page: String(perPage), page: String(page) },
      userAgent: "UltriaERP/woocommerce-worker",
    });
    const resp = await withRetry(() => wooRequestJson({ url, init: { headers } }));
    const products = Array.isArray(resp.data) ? resp.data : [];
    if (products.length === 0) break;

    for (const p of products) {
      const productId = Number(p?.id ?? 0) || 0;
      const type = String(p?.type ?? "simple");
      if (!productId) continue;

      if (type === "variable") {
        let vPage = 1;
        while (true) {
          const v = buildWooApiUrl({
            baseUrl: secrets.baseUrl,
            path: `products/${productId}/variations`,
            authMode: secrets.authMode,
            consumerKey: secrets.consumerKey,
            consumerSecret: secrets.consumerSecret,
            query: { per_page: String(perPage), page: String(vPage) },
            userAgent: "UltriaERP/woocommerce-worker",
          });
          const vr = await withRetry(() => wooRequestJson({ url: v.url, init: { headers: v.headers } }));
          const vars = Array.isArray(vr.data) ? vr.data : [];
          if (vars.length === 0) break;

          for (const vv of vars) {
            total += 1;
            const sku = String(vv?.sku ?? "").trim();
            const varId = Number(vv?.id ?? 0) || 0;
            if (!sku || !varId) {
              missingSku += 1;
              continue;
            }
            const key = sku.toLowerCase();
            seen.set(key, (seen.get(key) ?? 0) + 1);

            const revoProductId = await findProductIdBySku(svc, secrets.empresaId, sku);
            await svc.from("woocommerce_product_map").upsert(
              {
                empresa_id: secrets.empresaId,
                store_id: secrets.storeId,
                revo_product_id: revoProductId,
                woo_product_id: productId,
                woo_variation_id: varId,
                sku,
              },
              { onConflict: "store_id,sku,woo_product_id,woo_variation_id" },
            );
          }

          if (vars.length < perPage) break;
          vPage += 1;
        }
      } else {
        total += 1;
        const sku = String(p?.sku ?? "").trim();
        if (!sku) {
          missingSku += 1;
          continue;
        }
        const key = sku.toLowerCase();
        seen.set(key, (seen.get(key) ?? 0) + 1);

        const revoProductId = await findProductIdBySku(svc, secrets.empresaId, sku);
        await svc.from("woocommerce_product_map").upsert(
          {
            empresa_id: secrets.empresaId,
            store_id: secrets.storeId,
            revo_product_id: revoProductId,
            woo_product_id: productId,
            woo_variation_id: 0,
            sku,
          },
          { onConflict: "store_id,sku,woo_product_id,woo_variation_id" },
        );
      }
    }

    if (products.length < perPage) break;
    page += 1;
  }

  for (const count of seen.values()) if (count > 1) duplicates += 1;
  return { total, missingSku, duplicates };
}

async function syncBySkus(params: {
  svc: any;
  secrets: StoreSecrets;
  kind: "PRICE_SYNC" | "STOCK_SYNC";
  skus: string[];
  runId?: string | null;
}): Promise<{ updated: number; skipped: number; failed: number; perSku: Array<{ sku: string; status: "updated" | "skipped" | "failed"; error_code?: string | null; hint?: string | null; revo_product_id?: string | null; woo_product_id?: number | null; woo_variation_id?: number | null }> }> {
  const { svc, secrets, kind } = params;
  const skus = Array.from(new Set(params.skus.map((s) => String(s ?? "").trim()).filter(Boolean)));
  if (skus.length === 0) return { updated: 0, skipped: 0, failed: 0, perSku: [] };

  const { data: maps, error: mapErr } = await svc
    .from("woocommerce_product_map")
    .select("sku,woo_product_id,woo_variation_id,revo_product_id")
    .eq("empresa_id", secrets.empresaId)
    .eq("store_id", secrets.storeId)
    .in("sku", skus);
  if (mapErr) throw mapErr;
  const rows = Array.isArray(maps) ? maps : [];

  // Load Revo products by SKU (source of truth).
  const { data: products, error: prodErr } = await svc
    .from("produtos")
    .select("id,sku,estoque_atual,preco_venda")
    .eq("empresa_id", secrets.empresaId)
    .in("sku", skus)
    .is("deleted_at", null);
  if (prodErr) throw prodErr;
  const productsBySku = new Map<string, any>();
  for (const p of (Array.isArray(products) ? products : [])) {
    const sku = String(p?.sku ?? "").trim();
    if (sku) productsBySku.set(sku, p);
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const perSku: Array<{ sku: string; status: "updated" | "skipped" | "failed"; error_code?: string | null; hint?: string | null; revo_product_id?: string | null; woo_product_id?: number | null; woo_variation_id?: number | null }> = [];

  // Separate simple products vs variations (variations require different endpoint).
  const simpleUpdates: any[] = [];
  const variationsByProduct = new Map<number, any[]>();

  for (const m of rows) {
    const sku = String(m?.sku ?? "").trim();
    const productId = Number(m?.woo_product_id ?? 0) || 0;
    const variationId = Number(m?.woo_variation_id ?? 0) || 0;
    if (!sku || !productId) continue;

    const revo = productsBySku.get(sku);
    if (!revo) {
      skipped += 1;
      perSku.push({ sku, status: "skipped", error_code: "WOO_MAPPING_MISSING", hint: "Produto não encontrado no Revo para o SKU informado." });
      continue;
    }

    if (kind === "STOCK_SYNC") {
      const stockQuantity = toWooStockQuantity(revo?.estoque_atual);
      if (variationId) {
        const list = variationsByProduct.get(productId) ?? [];
        list.push({ id: variationId, manage_stock: true, stock_quantity: stockQuantity });
        variationsByProduct.set(productId, list);
      } else {
        simpleUpdates.push({ id: productId, manage_stock: true, stock_quantity: stockQuantity });
      }
    } else {
      const regularPrice = toWooPrice(revo?.preco_venda);
      if (variationId) {
        const list = variationsByProduct.get(productId) ?? [];
        list.push({ id: variationId, regular_price: regularPrice });
        variationsByProduct.set(productId, list);
      } else {
        simpleUpdates.push({ id: productId, regular_price: regularPrice });
      }
    }

    perSku.push({
      sku,
      status: "updated",
      revo_product_id: revo?.id ? String(revo.id) : null,
      woo_product_id: productId,
      woo_variation_id: variationId || null,
    });
  }

  const chunkSize = 50;
  for (let i = 0; i < simpleUpdates.length; i += chunkSize) {
    const chunk = simpleUpdates.slice(i, i + chunkSize);
    const { url, headers } = buildWooApiUrl({
      baseUrl: secrets.baseUrl,
      path: "products/batch",
      authMode: secrets.authMode,
      consumerKey: secrets.consumerKey,
      consumerSecret: secrets.consumerSecret,
      userAgent: "UltriaERP/woocommerce-worker",
    });
    const resp = await withRetry(() =>
      wooRequestJson({
        url,
        init: { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ update: chunk }) },
      })
    );
    updated += chunk.length;
  }

  for (const [productId, vars] of variationsByProduct.entries()) {
    for (let i = 0; i < vars.length; i += chunkSize) {
      const chunk = vars.slice(i, i + chunkSize);
      const { url, headers } = buildWooApiUrl({
        baseUrl: secrets.baseUrl,
        path: `products/${productId}/variations/batch`,
        authMode: secrets.authMode,
        consumerKey: secrets.consumerKey,
        consumerSecret: secrets.consumerSecret,
        userAgent: "UltriaERP/woocommerce-worker",
      });
      const resp = await withRetry(() =>
        wooRequestJson({
          url,
          init: { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ update: chunk }) },
        })
      );
      updated += chunk.length;
    }
  }

  // Update last synced timestamps.
  const ts = new Date().toISOString();
  if (kind === "STOCK_SYNC") {
    await svc.from("woocommerce_product_map").update({ last_synced_stock_at: ts }).eq("empresa_id", secrets.empresaId).eq("store_id", secrets.storeId).in("sku", skus);
  } else {
    await svc.from("woocommerce_product_map").update({ last_synced_price_at: ts }).eq("empresa_id", secrets.empresaId).eq("store_id", secrets.storeId).in("sku", skus);
  }

  for (const sku of skus) {
    if (!perSku.some((row) => row.sku === sku)) {
      perSku.push({ sku, status: "skipped", error_code: "WOO_MAPPING_MISSING", hint: "SKU sem mapeamento para a loja." });
    }
  }

  if (params.runId) {
    const { data: runItems } = await svc
      .from("woocommerce_sync_run_item")
      .select("id,sku,revo_product_id,woo_product_id,woo_variation_id")
      .eq("run_id", params.runId)
      .eq("empresa_id", secrets.empresaId)
      .eq("store_id", secrets.storeId);
    const items = Array.isArray(runItems) ? runItems : [];
    for (const item of items) {
      const sku = String(item?.sku ?? "").trim();
      const found = perSku.find((row) => row.sku === sku);
      if (!found) continue;
      if (found.status === "updated") {
        await updateRunItemStatus({
          svc,
          itemId: String(item.id),
          empresaId: secrets.empresaId,
          storeId: secrets.storeId,
          status: "DONE",
        });
        if (item?.revo_product_id) {
          await upsertListing({
            svc,
            empresaId: secrets.empresaId,
            storeId: secrets.storeId,
            revoProductId: String(item.revo_product_id),
            sku: sku || null,
            wooProductId: Number(item?.woo_product_id ?? 0) || null,
            wooVariationId: Number(item?.woo_variation_id ?? 0) || null,
            listingStatus: "linked",
            touchPrice: kind === "PRICE_SYNC",
            touchStock: kind === "STOCK_SYNC",
          });
        }
      } else if (found.status === "skipped") {
        await updateRunItemStatus({
          svc,
          itemId: String(item.id),
          empresaId: secrets.empresaId,
          storeId: secrets.storeId,
          status: "SKIPPED",
          errorCode: found.error_code ?? null,
          hint: found.hint ?? null,
        });
      } else {
        await updateRunItemStatus({
          svc,
          itemId: String(item.id),
          empresaId: secrets.empresaId,
          storeId: secrets.storeId,
          status: "ERROR",
          errorCode: found.error_code ?? "WOO_UNEXPECTED",
          hint: found.hint ?? null,
          lastError: found.error_code ?? "Falha ao sincronizar SKU.",
        });
      }
    }
    await refreshRunSummary({ svc, runId: params.runId, empresaId: secrets.empresaId, storeId: secrets.storeId });
  }

  return { updated, skipped, failed, perSku };
}

async function reconcileRecentOrders(params: {
  svc: any;
  secrets: StoreSecrets;
  payload: any;
}): Promise<{ imported: number; scanned: number; since: string }> {
  const since = String(params.payload?.since ?? new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  const maxPages = Math.max(1, Math.min(5, Number(params.payload?.max_pages ?? 2)));
  const perPage = Math.max(1, Math.min(100, Number(params.payload?.per_page ?? 50)));
  let imported = 0;
  let scanned = 0;

  for (let page = 1; page <= maxPages; page++) {
    const listReq = buildWooApiUrl({
      baseUrl: params.secrets.baseUrl,
      path: "orders",
      authMode: params.secrets.authMode,
      consumerKey: params.secrets.consumerKey,
      consumerSecret: params.secrets.consumerSecret,
      query: {
        per_page: String(perPage),
        page: String(page),
        orderby: "modified",
        order: "desc",
        after: since,
      },
      userAgent: "UltriaERP/woocommerce-worker",
    });
    const listResp = await withRetry(() => wooRequestJson({ url: listReq.url, init: { headers: listReq.headers } }));
    const orders = Array.isArray(listResp.data) ? listResp.data : [];
    if (orders.length === 0) break;

    for (const order of orders) {
      const orderId = Number(order?.id ?? 0) || 0;
      if (!orderId) continue;
      scanned += 1;

      const fullReq = buildWooApiUrl({
        baseUrl: params.secrets.baseUrl,
        path: `orders/${orderId}`,
        authMode: params.secrets.authMode,
        consumerKey: params.secrets.consumerKey,
        consumerSecret: params.secrets.consumerSecret,
        userAgent: "UltriaERP/woocommerce-worker",
      });
      const fullResp = await withRetry(() => wooRequestJson({ url: fullReq.url, init: { headers: fullReq.headers } }));
      await upsertOrderIntoRevo({
        svc: params.svc,
        empresaId: params.secrets.empresaId,
        storeId: params.secrets.storeId,
        order: fullResp.data,
      });
      imported += 1;
    }

    if (orders.length < perPage) break;
  }

  return { imported, scanned, since };
}

function backoffNextRun(attempt: number): string {
  return new Date(Date.now() + computeBackoffMs(attempt)).toISOString();
}

async function pauseStoreForAuthFailure(params: {
  svc: any;
  secrets: StoreSecrets;
  message: string;
  hint: string;
}) {
  await params.svc
    .from("integrations_woocommerce_store")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", params.secrets.storeId)
    .eq("empresa_id", params.secrets.empresaId);

  await params.svc
    .from("woocommerce_sync_job")
    .update({
      status: "error",
      last_error: params.message,
      next_run_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      lock_owner: null,
      locked_at: null,
    })
    .eq("empresa_id", params.secrets.empresaId)
    .eq("store_id", params.secrets.storeId)
    .in("status", ["queued", "running", "error"]);

  await params.svc.from("woocommerce_sync_log").insert({
    empresa_id: params.secrets.empresaId,
    store_id: params.secrets.storeId,
    level: "error",
    message: "store_paused_auth_failure",
    meta: { error: params.message, hint: params.hint },
  });
}

async function runWorkerBatch(params: {
  svc: any;
  masterKey: string;
  storeId: string | null;
  limit: number;
  lockOwner: string;
}) {
  const { data: claimed, error: claimErr } = await params.svc.rpc("woocommerce_sync_jobs_claim", {
    p_limit: params.limit,
    p_store_id: params.storeId,
    p_lock_owner: params.lockOwner,
  });
  if (claimErr) throw new Error(`CLAIM_FAILED:${claimErr.message}`);

  const jobs: JobRow[] = Array.isArray(claimed) ? claimed : [];
  const runnableJobs = pickUniqueByStoreType(jobs);
  if (runnableJobs.length === 0) return { processed: 0, results: [] as any[] };

  let processed = 0;
  const results: any[] = [];

  for (const j of runnableJobs) {
    const jobId = String(j.id);
    try {
      const secrets = await loadStoreSecrets({ svc: params.svc, masterKey: params.masterKey, storeId: String(j.store_id) });

      if (j.type === "CATALOG_RECONCILE") {
        const r = await buildProductMap({ svc: params.svc, secrets });
        await params.svc.from("woocommerce_sync_log").insert({
          empresa_id: secrets.empresaId,
          store_id: secrets.storeId,
          job_id: jobId,
          level: "info",
          message: "product_map_built",
          meta: sanitizeForLog(r),
        });
        await params.svc.rpc("woocommerce_sync_job_complete", { p_job_id: jobId, p_ok: true, p_error: null, p_next_run_at: null });
        processed += 1;
        results.push({ job_id: jobId, store_id: secrets.storeId, type: j.type, ok: true, ...r });
        continue;
      }

      if (j.type === "ORDER_RECONCILE") {
        const orderId = Number(j.payload?.order_id ?? 0) || 0;
        if (orderId > 0) {
          const { url, headers } = buildWooApiUrl({
            baseUrl: secrets.baseUrl,
            path: `orders/${orderId}`,
            authMode: secrets.authMode,
            consumerKey: secrets.consumerKey,
            consumerSecret: secrets.consumerSecret,
            userAgent: "UltriaERP/woocommerce-worker",
          });
          const resp = await withRetry(() => wooRequestJson({ url, init: { headers } }));
          const { revoOrderId } = await upsertOrderIntoRevo({
            svc: params.svc,
            empresaId: secrets.empresaId,
            storeId: secrets.storeId,
            order: resp.data,
          });

          await params.svc.from("woocommerce_webhook_event").update({
            processed_at: new Date().toISOString(),
            process_status: "done",
            last_error: null,
            error_code: null,
          }).eq("store_id", secrets.storeId).eq("woo_resource_id", orderId).eq("payload_hash", String(j.payload?.payload_hash ?? "")).in("process_status", ["queued", "dropped"]);

          await params.svc.rpc("woocommerce_sync_job_complete", { p_job_id: jobId, p_ok: true, p_error: null, p_next_run_at: null });
          processed += 1;
          results.push({ job_id: jobId, store_id: secrets.storeId, type: j.type, ok: true, revo_order_id: revoOrderId });
          continue;
        }

        const reconcile = await reconcileRecentOrders({
          svc: params.svc,
          secrets,
          payload: j.payload ?? {},
        });
        await params.svc.rpc("woocommerce_sync_job_complete", { p_job_id: jobId, p_ok: true, p_error: null, p_next_run_at: null });
        processed += 1;
        results.push({ job_id: jobId, store_id: secrets.storeId, type: j.type, ok: true, reconcile });
        continue;
      }

      if (j.type === "CATALOG_EXPORT") {
        const runId = String(j.payload?.run_id ?? "").trim();
        if (!runId) throw new Error("RUN_ID_REQUIRED");
        await params.svc
          .from("woocommerce_sync_run")
          .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", runId)
          .eq("empresa_id", secrets.empresaId)
          .eq("store_id", secrets.storeId);

        const { data: runItems } = await params.svc
          .from("woocommerce_sync_run_item")
          .select("id,sku,revo_product_id,woo_product_id,woo_variation_id,action,status")
          .eq("run_id", runId)
          .eq("empresa_id", secrets.empresaId)
          .eq("store_id", secrets.storeId)
          .in("status", ["QUEUED", "RUNNING"]);
        const items = Array.isArray(runItems) ? runItems : [];

        for (const item of items) {
          const itemId = String(item.id);
          const revoProductId = String(item?.revo_product_id ?? "").trim();
          const sku = String(item?.sku ?? "").trim();
          if (!revoProductId || !sku) {
            await updateRunItemStatus({
              svc: params.svc,
              itemId,
              empresaId: secrets.empresaId,
              storeId: secrets.storeId,
              status: "ERROR",
              errorCode: "WOO_PREVIEW_BLOCKED",
              hint: "Item sem SKU ou produto Revo vinculado.",
              lastError: "RUN_ITEM_INVALID",
            });
            continue;
          }

          const { data: revoProduct } = await params.svc
            .from("produtos")
            .select("id,nome,descricao,status,preco_venda,estoque_atual")
            .eq("empresa_id", secrets.empresaId)
            .eq("id", revoProductId)
            .is("deleted_at", null)
            .maybeSingle();
          if (!revoProduct?.id) {
            await updateRunItemStatus({
              svc: params.svc,
              itemId,
              empresaId: secrets.empresaId,
              storeId: secrets.storeId,
              status: "ERROR",
              errorCode: "WOO_MAPPING_MISSING",
              hint: "Produto Revo não encontrado.",
              lastError: "REVO_PRODUCT_NOT_FOUND",
            });
            continue;
          }

          const basePayload = {
            name: String(revoProduct.nome ?? "").trim() || `Produto ${sku}`,
            sku,
            regular_price: toWooPrice(revoProduct.preco_venda),
            manage_stock: true,
            stock_quantity: toWooStockQuantity(revoProduct.estoque_atual),
            stock_status: toWooStockQuantity(revoProduct.estoque_atual) > 0 ? "instock" : "outofstock",
            status: toWooStatusFromRevo(String(revoProduct.status ?? "")),
            short_description: String(revoProduct.descricao ?? "").slice(0, 500) || undefined,
          } as Record<string, unknown>;

          try {
            const action = String(item?.action ?? "").toUpperCase();
            const wooProductId = Number(item?.woo_product_id ?? 0) || 0;
            if (action === "CREATE" || !wooProductId) {
              const createReq = buildWooApiUrl({
                baseUrl: secrets.baseUrl,
                path: "products",
                authMode: secrets.authMode,
                consumerKey: secrets.consumerKey,
                consumerSecret: secrets.consumerSecret,
                userAgent: "UltriaERP/woocommerce-worker",
              });
              const createResp = await withRetry(() => wooRequestJson({
                url: createReq.url,
                init: {
                  method: "POST",
                  headers: { ...createReq.headers, "Content-Type": "application/json" },
                  body: JSON.stringify(basePayload),
                },
              }));
              const createdWooProductId = Number(createResp.data?.id ?? 0) || 0;
              if (!createdWooProductId) throw new Error("WOO_CREATE_NO_ID");
              await params.svc.from("woocommerce_product_map").upsert({
                empresa_id: secrets.empresaId,
                store_id: secrets.storeId,
                revo_product_id: revoProductId,
                sku,
                woo_product_id: createdWooProductId,
                woo_variation_id: 0,
                last_synced_price_at: new Date().toISOString(),
                last_synced_stock_at: new Date().toISOString(),
              }, { onConflict: "store_id,sku,woo_product_id,woo_variation_id" });
              await upsertListing({
                svc: params.svc,
                empresaId: secrets.empresaId,
                storeId: secrets.storeId,
                revoProductId,
                sku,
                wooProductId: createdWooProductId,
                wooVariationId: null,
                listingStatus: "linked",
                touchPrice: true,
                touchStock: true,
              });
            } else {
              const updateReq = buildWooApiUrl({
                baseUrl: secrets.baseUrl,
                path: `products/${wooProductId}`,
                authMode: secrets.authMode,
                consumerKey: secrets.consumerKey,
                consumerSecret: secrets.consumerSecret,
                userAgent: "UltriaERP/woocommerce-worker",
              });
              await withRetry(() => wooRequestJson({
                url: updateReq.url,
                init: {
                  method: "PUT",
                  headers: { ...updateReq.headers, "Content-Type": "application/json" },
                  body: JSON.stringify(basePayload),
                },
              }));
              await params.svc
                .from("woocommerce_product_map")
                .update({
                  revo_product_id: revoProductId,
                  last_synced_price_at: new Date().toISOString(),
                  last_synced_stock_at: new Date().toISOString(),
                })
                .eq("empresa_id", secrets.empresaId)
                .eq("store_id", secrets.storeId)
                .eq("sku", sku);
              await upsertListing({
                svc: params.svc,
                empresaId: secrets.empresaId,
                storeId: secrets.storeId,
                revoProductId,
                sku,
                wooProductId,
                wooVariationId: Number(item?.woo_variation_id ?? 0) || null,
                listingStatus: "linked",
                touchPrice: true,
                touchStock: true,
              });
            }

            await updateRunItemStatus({
              svc: params.svc,
              itemId,
              empresaId: secrets.empresaId,
              storeId: secrets.storeId,
              status: "DONE",
            });
          } catch (itemErr: any) {
            const message = String(itemErr?.message ?? "CATALOG_EXPORT_ITEM_FAILED");
            const resolved = resolveWooError(detectWooErrorCode(message));
            await updateRunItemStatus({
              svc: params.svc,
              itemId,
              empresaId: secrets.empresaId,
              storeId: secrets.storeId,
              status: "ERROR",
              errorCode: resolved.code,
              hint: resolved.hint,
              lastError: message,
            });
          }
        }

        await refreshRunSummary({ svc: params.svc, runId, empresaId: secrets.empresaId, storeId: secrets.storeId });
        await params.svc.rpc("woocommerce_sync_job_complete", { p_job_id: jobId, p_ok: true, p_error: null, p_next_run_at: null });
        processed += 1;
        results.push({ job_id: jobId, store_id: secrets.storeId, type: j.type, ok: true, run_id: runId });
        continue;
      }

      if (j.type === "CATALOG_IMPORT") {
        const runId = String(j.payload?.run_id ?? "").trim();
        if (!runId) throw new Error("RUN_ID_REQUIRED");
        await params.svc
          .from("woocommerce_sync_run")
          .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", runId)
          .eq("empresa_id", secrets.empresaId)
          .eq("store_id", secrets.storeId);

        const { data: runItems } = await params.svc
          .from("woocommerce_sync_run_item")
          .select("id,sku,revo_product_id,woo_product_id,action,status")
          .eq("run_id", runId)
          .eq("empresa_id", secrets.empresaId)
          .eq("store_id", secrets.storeId)
          .in("status", ["QUEUED", "RUNNING"]);
        const items = Array.isArray(runItems) ? runItems : [];

        for (const item of items) {
          const itemId = String(item.id);
          const wooProductId = Number(item?.woo_product_id ?? 0) || 0;
          if (!wooProductId) {
            await updateRunItemStatus({
              svc: params.svc,
              itemId,
              empresaId: secrets.empresaId,
              storeId: secrets.storeId,
              status: "ERROR",
              errorCode: "WOO_PREVIEW_BLOCKED",
              hint: "ID do produto Woo ausente.",
              lastError: "WOO_PRODUCT_ID_REQUIRED",
            });
            continue;
          }

          try {
            const reqWoo = buildWooApiUrl({
              baseUrl: secrets.baseUrl,
              path: `products/${wooProductId}`,
              authMode: secrets.authMode,
              consumerKey: secrets.consumerKey,
              consumerSecret: secrets.consumerSecret,
              userAgent: "UltriaERP/woocommerce-worker",
            });
            const wooResp = await withRetry(() => wooRequestJson({ url: reqWoo.url, init: { headers: reqWoo.headers } }));
            const imported = await createOrUpdateRevoProductFromWoo({
              svc: params.svc,
              empresaId: secrets.empresaId,
              woo: wooResp.data,
            });
            const sku = String(wooResp.data?.sku ?? "").trim() || null;
            await params.svc.from("woocommerce_product_map").upsert({
              empresa_id: secrets.empresaId,
              store_id: secrets.storeId,
              revo_product_id: imported.revoProductId,
              sku,
              woo_product_id: wooProductId,
              woo_variation_id: 0,
              last_synced_price_at: new Date().toISOString(),
              last_synced_stock_at: new Date().toISOString(),
            }, { onConflict: "store_id,sku,woo_product_id,woo_variation_id" });
            await upsertListing({
              svc: params.svc,
              empresaId: secrets.empresaId,
              storeId: secrets.storeId,
              revoProductId: imported.revoProductId,
              sku,
              wooProductId,
              wooVariationId: null,
              listingStatus: "linked",
              touchPrice: true,
              touchStock: true,
            });
            await updateRunItemStatus({
              svc: params.svc,
              itemId,
              empresaId: secrets.empresaId,
              storeId: secrets.storeId,
              status: "DONE",
            });
          } catch (itemErr: any) {
            const message = String(itemErr?.message ?? "CATALOG_IMPORT_ITEM_FAILED");
            const resolved = resolveWooError(detectWooErrorCode(message));
            await updateRunItemStatus({
              svc: params.svc,
              itemId,
              empresaId: secrets.empresaId,
              storeId: secrets.storeId,
              status: "ERROR",
              errorCode: resolved.code,
              hint: resolved.hint,
              lastError: message,
            });
          }
        }

        await refreshRunSummary({ svc: params.svc, runId, empresaId: secrets.empresaId, storeId: secrets.storeId });
        await params.svc.rpc("woocommerce_sync_job_complete", { p_job_id: jobId, p_ok: true, p_error: null, p_next_run_at: null });
        processed += 1;
        results.push({ job_id: jobId, store_id: secrets.storeId, type: j.type, ok: true, run_id: runId });
        continue;
      }

      if (j.type === "STOCK_SYNC" || j.type === "PRICE_SYNC") {
        const skus = Array.isArray(j.payload?.skus) ? j.payload.skus : [];
        const runId = String(j.payload?.run_id ?? "").trim() || null;
        if (runId) {
          await params.svc
            .from("woocommerce_sync_run")
            .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", runId)
            .eq("empresa_id", secrets.empresaId)
            .eq("store_id", secrets.storeId);
        }
        const r = await syncBySkus({ svc: params.svc, secrets, kind: j.type, skus, runId });
        if (runId) {
          await refreshRunSummary({ svc: params.svc, runId, empresaId: secrets.empresaId, storeId: secrets.storeId });
        }
        await params.svc.rpc("woocommerce_sync_job_complete", { p_job_id: jobId, p_ok: true, p_error: null, p_next_run_at: null });
        processed += 1;
        results.push({ job_id: jobId, store_id: secrets.storeId, type: j.type, ok: true, ...r });
        continue;
      }

      throw new Error("JOB_TYPE_NOT_SUPPORTED");
    } catch (e: any) {
      const message = String(e?.message ?? "JOB_FAILED");
      const attempt = Number(j.attempts ?? 1);
      const nextRunAt = backoffNextRun(attempt);
      const classification = e instanceof WooRequestError
        ? { code: e.code, hint: e.hint, pauseStore: e.pauseStore }
        : (() => {
          const fallback = resolveWooError("WOO_UNEXPECTED");
          return { code: fallback.code, hint: fallback.hint, pauseStore: fallback.pauseStore };
        })();

      await params.svc.rpc("woocommerce_sync_job_complete", {
        p_job_id: jobId,
        p_ok: false,
        p_error: `${classification.code}:${message}`,
        p_next_run_at: nextRunAt,
      });

      if (e instanceof WooRequestError && e.pauseStore) {
        const secrets = await loadStoreSecrets({ svc: params.svc, masterKey: params.masterKey, storeId: String(j.store_id) });
        await pauseStoreForAuthFailure({
          svc: params.svc,
          secrets,
          message: `${classification.code}:${message}`,
          hint: classification.hint,
        });
      }

      await params.svc.from("woocommerce_sync_log").insert({
        empresa_id: String(j.empresa_id),
        store_id: String(j.store_id),
        job_id: jobId,
        level: "error",
        message: "job_failed",
        meta: sanitizeForLog({
          type: j.type,
          error: message,
          code: classification.code,
          hint: classification.hint,
          attempts: Number(j.attempts ?? 0),
          max_attempts: Number(j.max_attempts ?? 0),
          next_run_at: nextRunAt,
        }),
      });
      results.push({ job_id: jobId, store_id: String(j.store_id), type: j.type, ok: false, error: message, code: classification.code, hint: classification.hint });
    }
  }

  return { processed, results };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const masterKey = Deno.env.get("INTEGRATIONS_MASTER_KEY") ?? "";
  const workerKey = Deno.env.get("WOOCOMMERCE_WORKER_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "ENV_NOT_CONFIGURED" }, cors);
  if (!masterKey) return json(500, { ok: false, error: "MASTER_KEY_MISSING" }, cors);

  const headerKey = (req.headers.get("x-woocommerce-worker-key") ?? "").trim();
  if (!workerKey || !headerKey || !timingSafeEqual(workerKey, headerKey)) {
    return json(401, { ok: false, error: "UNAUTHORIZED_WORKER" }, cors);
  }

  const requestId = getRequestId(req);
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-revo-request-id": requestId } },
  });

  const body = (await req.json().catch(() => ({}))) as any;
  const storeId = body?.store_id ? String(body.store_id) : null;
  const limit = body?.limit != null ? Math.max(1, Math.min(20, Number(body.limit))) : 5;
  const runScheduler = !!body?.scheduler;
  const maxBatches = parsePositiveIntEnv(String(body?.max_batches ?? ""), 20);
  const schedulerRetentionDays = parsePositiveIntEnv(Deno.env.get("WOOCOMMERCE_WEBHOOK_RETENTION_DAYS"), 14);
  const lockOwner = `woocommerce-worker:${requestId}`.slice(0, 60);

  const mergedResults: any[] = [];
  let processedJobs = 0;

  for (let i = 0; i < (runScheduler ? maxBatches : 1); i++) {
    const batch = await runWorkerBatch({
      svc,
      masterKey,
      storeId,
      limit,
      lockOwner,
    });
    if (batch.processed === 0) break;
    processedJobs += batch.processed;
    mergedResults.push(...batch.results);
  }

  if (runScheduler) {
    await svc.rpc("woocommerce_webhook_event_cleanup", {
      p_store_id: storeId,
      p_keep_days: schedulerRetentionDays,
      p_limit: 200,
    }).catch(() => null);
  }

  return json(200, {
    ok: true,
    processed_jobs: processedJobs,
    scheduler: runScheduler ? { max_batches: maxBatches } : undefined,
    results: mergedResults,
  }, cors);
});
