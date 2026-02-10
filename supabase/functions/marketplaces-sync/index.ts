import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { chooseNextPedidoStatus, mapMeliOrderStatus } from "../_shared/meli_mapping.ts";
import { finopsTrackUsage } from "../_shared/finops.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MELI_CLIENT_ID = (Deno.env.get("MELI_CLIENT_ID") ?? "").trim();
const MELI_CLIENT_SECRET = (Deno.env.get("MELI_CLIENT_SECRET") ?? "").trim();

type Provider = "meli" | "shopee" | "woo";
type Action = "import_orders";

type Body = {
  provider?: Provider;
  action?: Action;
  since?: string | null; // ISO
};

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function retryAfterSeconds(nextRetryAt: any): number | null {
  if (!nextRetryAt) return null;
  const d = new Date(String(nextRetryAt));
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(1, Math.ceil((d.getTime() - Date.now()) / 1000));
}

async function getAdapterVersion(params: {
  admin: any;
  empresaId: string;
  provider: Provider;
  kind: Action;
}): Promise<number> {
  try {
    const { data } = await params.admin
      .from("integration_adapter_versions")
      .select("current_version")
      .eq("empresa_id", params.empresaId)
      .eq("provider", params.provider)
      .eq("kind", params.kind)
      .maybeSingle();
    const v = Number((data as any)?.current_version ?? 1);
    return Number.isFinite(v) && v >= 1 ? v : 1;
  } catch {
    return 1;
  }
}

async function circuitBreakerShouldAllow(params: {
  admin: any;
  empresaId: string;
  domain: string;
  provider: string;
}): Promise<{ allowed: boolean; state: string | null; next_retry_at: string | null }> {
  try {
    const { data, error } = await params.admin.rpc("integration_circuit_breaker_should_allow", {
      p_empresa_id: params.empresaId,
      p_domain: params.domain,
      p_provider: params.provider,
    });
    if (error) return { allowed: true, state: null, next_retry_at: null };
    return {
      allowed: !!data?.allowed,
      state: data?.state != null ? String(data.state) : null,
      next_retry_at: data?.next_retry_at != null ? String(data.next_retry_at) : null,
    };
  } catch {
    return { allowed: true, state: null, next_retry_at: null };
  }
}

async function circuitBreakerRecord(params: {
  admin: any;
  empresaId: string;
  domain: string;
  provider: string;
  ok: boolean;
  error?: string | null;
}) {
  try {
    await params.admin.rpc("integration_circuit_breaker_record_result", {
      p_empresa_id: params.empresaId,
      p_domain: params.domain,
      p_provider: params.provider,
      p_ok: params.ok,
      p_error: params.error ?? null,
    });
  } catch {
    // ignore
  }
}

async function rateLimitCheck(params: {
  admin: any;
  empresaId: string;
  domain: string;
  action: string;
  limit: number;
  windowSeconds: number;
  cost?: number;
}): Promise<{ allowed: boolean; retry_after_seconds: number | null }> {
  try {
    const { data, error } = await params.admin.rpc("integration_rate_limit_check", {
      p_empresa_id: params.empresaId,
      p_domain: params.domain,
      p_action: params.action,
      p_limit: params.limit,
      p_window_seconds: params.windowSeconds,
      p_cost: params.cost ?? 1,
    });
    if (error) return { allowed: true, retry_after_seconds: null };
    return {
      allowed: !!data?.allowed,
      retry_after_seconds: data?.retry_after_seconds != null ? Number(data.retry_after_seconds) : null,
    };
  } catch {
    return { allowed: true, retry_after_seconds: null };
  }
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function plusDaysIso(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function minusDaysIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function canManageEcommerce(userClient: any): Promise<boolean> {
  try {
    const { data } = await userClient.rpc("has_permission_for_current_user", {
      p_module: "ecommerce",
      p_action: "manage",
    });
    return !!data;
  } catch {
    return false;
  }
}

async function refreshMeliToken(params: { refreshToken: string; }): Promise<{ ok: boolean; status: number; data: any }> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", MELI_CLIENT_ID);
  body.set("client_secret", MELI_CLIENT_SECRET);
  body.set("refresh_token", params.refreshToken);
  const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function meliFetchJson(url: string, accessToken: string): Promise<{ ok: boolean; status: number; data: any }> {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

function normalizeStoreUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("WOO_STORE_URL_REQUIRED");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("WOO_STORE_URL_INVALID");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("WOO_STORE_URL_INVALID");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function mapWooOrderStatus(order: any): "orcamento" | "aprovado" | "cancelado" {
  const status = String(order?.status ?? "").toLowerCase();
  const hasPaidDate = !!order?.date_paid;
  if (["cancelled", "failed", "refunded", "trash"].includes(status)) return "cancelado";
  if (["completed", "processing"].includes(status) || hasPaidDate) return "aprovado";
  return "orcamento";
}

function buildWooOrdersUrl(params: {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  afterIso: string;
  page: number;
  perPage?: number;
}): string {
  const u = new URL(`${params.storeUrl}/wp-json/wc/v3/orders`);
  u.searchParams.set("consumer_key", params.consumerKey);
  u.searchParams.set("consumer_secret", params.consumerSecret);
  u.searchParams.set("after", params.afterIso);
  u.searchParams.set("orderby", "date");
  u.searchParams.set("order", "asc");
  u.searchParams.set("per_page", String(params.perPage ?? 50));
  u.searchParams.set("page", String(params.page));
  return u.toString();
}

async function wooFetchJson(url: string): Promise<{ ok: boolean; status: number; data: any }> {
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "UltriaERP/marketplaces-sync-woo",
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function ensureWooBuyerAsPartner(admin: any, empresaId: string, order: any): Promise<string> {
  const billing = order?.billing ?? {};
  const email = String(billing?.email ?? "").trim();
  const externalIdRaw = order?.customer_id != null && Number(order.customer_id) > 0
    ? `woo:customer:${String(order.customer_id)}`
    : email
      ? `woo:guest:${email.toLowerCase()}`
      : null;
  const name = [billing?.first_name, billing?.last_name].filter(Boolean).join(" ").trim() || `Cliente Woo ${String(order?.id ?? "").trim() || "sem-id"}`;

  if (externalIdRaw) {
    const { data: existing } = await admin
      .from("pessoas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("codigo_externo", externalIdRaw)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) return String(existing.id);
  }

  const { data: created, error } = await admin.from("pessoas").insert({
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

async function findProductForWooItem(admin: any, empresaId: string, item: any): Promise<string | null> {
  const sku = String(item?.sku ?? "").trim();
  if (!sku) return null;
  const { data } = await admin
    .from("produtos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("sku", sku)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

function num(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function ensureBuyerAsPartner(admin: any, empresaId: string, buyer: any): Promise<string> {
  const buyerId = buyer?.id != null ? String(buyer.id) : "";
  const code = buyerId ? `meli:${buyerId}` : null;
  const name =
    [buyer?.first_name, buyer?.last_name].filter(Boolean).join(" ").trim() ||
    String(buyer?.nickname ?? "").trim() ||
    (buyerId ? `Cliente Mercado Livre ${buyerId}` : "Cliente Mercado Livre");

  if (code) {
    const { data: existing } = await admin
      .from("pessoas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("codigo_externo", code)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
  }

  const payload: any = {
    empresa_id: empresaId,
    tipo: "cliente",
    nome: name,
    email: buyer?.email ? String(buyer.email) : null,
    telefone: null,
    doc_unico: null,
    codigo_externo: code,
    tipo_pessoa: "fisica",
  };
  const { data: created, error } = await admin.from("pessoas").insert(payload).select("id").single();
  if (error) throw error;
  return created.id as string;
}

async function findProductForMeliItem(admin: any, ecommerceId: string, empresaId: string, item: any): Promise<string | null> {
  const itemId = item?.item?.id != null ? String(item.item.id) : null;
  if (!itemId) return null;
  const { data } = await admin
    .from("produto_anuncios")
    .select("produto_id")
    .eq("empresa_id", empresaId)
    .eq("ecommerce_id", ecommerceId)
    .eq("identificador", itemId)
    .maybeSingle();
  return data?.produto_id ? String(data.produto_id) : null;
}

async function upsertPedidoFromMeliOrder(params: {
  admin: any;
  empresaId: string;
  ecommerceId: string;
  order: any;
}): Promise<{ pedidoId: string | null; skippedItems: number; totalItems: number }> {
  const { admin, empresaId, ecommerceId, order } = params;

  const externalOrderId = order?.id != null ? String(order.id) : "";
  if (!externalOrderId) return { pedidoId: null, skippedItems: 0, totalItems: 0 };

  const buyer = order?.buyer ?? {};
  const clienteId = await ensureBuyerAsPartner(admin, empresaId, buyer);

  const desiredStatus = mapMeliOrderStatus(order);
  const createdAtIso = toIsoOrNull(order?.date_created) ?? new Date().toISOString();
  const dataEmissao = createdAtIso.slice(0, 10); // date

  const orderItems = Array.isArray(order?.order_items) ? order.order_items : [];
  let totalProdutos = 0;
  let skippedItems = 0;

  // Cria/atualiza pedido local
  const basePedido: any = {
    empresa_id: empresaId,
    cliente_id: clienteId,
    data_emissao: dataEmissao,
    frete: num(order?.shipping?.cost, 0),
    desconto: 0,
    condicao_pagamento: null,
    observacoes: `Mercado Livre #${externalOrderId}`,
    canal: "marketplace",
  };

  // vínculo
  const { data: linkExisting } = await admin
    .from("ecommerce_order_links")
    .select("vendas_pedido_id")
    .eq("empresa_id", empresaId)
    .eq("ecommerce_id", ecommerceId)
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  let pedidoId: string | null = linkExisting?.vendas_pedido_id ? String(linkExisting.vendas_pedido_id) : null;

  if (pedidoId) {
    const { data: existing } = await admin.from("vendas_pedidos").select("status").eq("id", pedidoId).eq("empresa_id", empresaId).maybeSingle();
    basePedido.status = chooseNextPedidoStatus(existing?.status, desiredStatus);
    await admin.from("vendas_pedidos").update(basePedido).eq("id", pedidoId).eq("empresa_id", empresaId);
    await admin.from("vendas_itens_pedido").delete().eq("empresa_id", empresaId).eq("pedido_id", pedidoId);
  } else {
    basePedido.status = desiredStatus;
    const { data: created, error } = await admin.from("vendas_pedidos").insert(basePedido).select("id").single();
    if (error) throw error;
    pedidoId = String(created.id);
  }

  const itemsToInsert: any[] = [];
  for (const it of orderItems) {
    const produtoId = await findProductForMeliItem(admin, ecommerceId, empresaId, it);
    if (!produtoId) {
      skippedItems += 1;
      continue;
    }
    const qty = num(it?.quantity, 0);
    const unit = num(it?.unit_price, 0);
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
    const { error: itErr } = await admin.from("vendas_itens_pedido").insert(itemsToInsert);
    if (itErr) throw itErr;
  }

  const totalGeral = Math.max(0, totalProdutos + basePedido.frete - basePedido.desconto);
  await admin.from("vendas_pedidos").update({
    total_produtos: totalProdutos,
    total_geral: totalGeral,
  }).eq("id", pedidoId).eq("empresa_id", empresaId);

  await admin.from("ecommerce_order_links").upsert(
    {
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "meli",
      external_order_id: externalOrderId,
      vendas_pedido_id: pedidoId,
      status: String(order?.status ?? null),
      payload: sanitizeForLog(order ?? {}),
      imported_at: new Date().toISOString(),
    },
    { onConflict: "ecommerce_id,external_order_id" },
  );

  return { pedidoId, skippedItems, totalItems: orderItems.length };
}

async function upsertPedidoFromWooOrder(params: {
  admin: any;
  empresaId: string;
  ecommerceId: string;
  order: any;
  runId: string | null;
  jobId: string;
}): Promise<{ pedidoId: string | null; skippedItems: number; totalItems: number; createdItems: number; updatedItems: number; failedItems: number; }> {
  const { admin, empresaId, ecommerceId, order, runId, jobId } = params;
  const externalOrderId = order?.id != null ? String(order.id) : "";
  if (!externalOrderId) return { pedidoId: null, skippedItems: 0, totalItems: 0, createdItems: 0, updatedItems: 0, failedItems: 0 };

  const clienteId = await ensureWooBuyerAsPartner(admin, empresaId, order);
  const desiredStatus = mapWooOrderStatus(order);
  const createdAtIso = toIsoOrNull(order?.date_created) ?? new Date().toISOString();
  const dataEmissao = createdAtIso.slice(0, 10);
  const frete = num(order?.shipping_total, 0);
  const desconto = num(order?.discount_total, 0);

  const basePedido: any = {
    empresa_id: empresaId,
    cliente_id: clienteId,
    data_emissao: dataEmissao,
    frete,
    desconto,
    condicao_pagamento: null,
    observacoes: `WooCommerce #${externalOrderId}`,
    canal: "marketplace",
  };

  const { data: linkExisting } = await admin
    .from("ecommerce_order_links")
    .select("vendas_pedido_id")
    .eq("empresa_id", empresaId)
    .eq("ecommerce_id", ecommerceId)
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  let pedidoId: string | null = linkExisting?.vendas_pedido_id ? String(linkExisting.vendas_pedido_id) : null;
  const isUpdate = !!pedidoId;
  if (pedidoId) {
    const { data: existing } = await admin
      .from("vendas_pedidos")
      .select("status")
      .eq("id", pedidoId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    basePedido.status = chooseNextPedidoStatus(existing?.status, desiredStatus);
    await admin.from("vendas_pedidos").update(basePedido).eq("id", pedidoId).eq("empresa_id", empresaId);
    await admin.from("vendas_itens_pedido").delete().eq("empresa_id", empresaId).eq("pedido_id", pedidoId);
  } else {
    basePedido.status = desiredStatus;
    const { data: created, error } = await admin.from("vendas_pedidos").insert(basePedido).select("id").single();
    if (error) throw error;
    pedidoId = String(created.id);
  }

  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  const itemsToInsert: any[] = [];
  let totalProdutos = 0;
  let skippedItems = 0;
  let failedItems = 0;

  for (const line of lineItems) {
    try {
      const produtoId = await findProductForWooItem(admin, empresaId, line);
      if (!produtoId) {
        skippedItems += 1;
        await admin.from("ecommerce_job_items").insert({
          empresa_id: empresaId,
          job_id: jobId,
          run_id: runId,
          provider: "woo",
          kind: "import_orders",
          external_id: externalOrderId,
          sku: String(line?.sku ?? "").trim() || null,
          action: "skipped",
          status: "skipped",
          message: "SKU não mapeado em produtos",
          context: sanitizeForLog({ item_id: line?.id ?? null, product_id: line?.product_id ?? null }),
        });
        continue;
      }
      const qty = num(line?.quantity, 0);
      const unit = num(line?.price, num(line?.total, 0));
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

      await admin.from("ecommerce_job_items").insert({
        empresa_id: empresaId,
        job_id: jobId,
        run_id: runId,
        provider: "woo",
        kind: "import_orders",
        external_id: externalOrderId,
        sku: String(line?.sku ?? "").trim() || null,
        action: isUpdate ? "updated" : "created",
        status: isUpdate ? "updated" : "created",
        message: null,
        context: sanitizeForLog({ item_id: line?.id ?? null }),
      });
    } catch (itemErr: any) {
      failedItems += 1;
      await admin.from("ecommerce_job_items").insert({
        empresa_id: empresaId,
        job_id: jobId,
        run_id: runId,
        provider: "woo",
        kind: "import_orders",
        external_id: externalOrderId,
        sku: String(line?.sku ?? "").trim() || null,
        action: "failed",
        status: "failed",
        message: itemErr?.message || "Falha ao processar item do pedido",
        context: sanitizeForLog({ item_id: line?.id ?? null }),
      });
    }
  }

  if (itemsToInsert.length > 0) {
    const { error: itErr } = await admin.from("vendas_itens_pedido").insert(itemsToInsert);
    if (itErr) throw itErr;
  }

  const totalGeral = Math.max(0, totalProdutos + frete - desconto);
  await admin.from("vendas_pedidos").update({
    total_produtos: totalProdutos,
    total_geral: totalGeral,
  }).eq("id", pedidoId).eq("empresa_id", empresaId);

  await admin.from("ecommerce_order_links").upsert(
    {
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "woo",
      external_order_id: externalOrderId,
      vendas_pedido_id: pedidoId,
      status: String(order?.status ?? null),
      payload: sanitizeForLog(order ?? {}),
      imported_at: new Date().toISOString(),
    },
    { onConflict: "ecommerce_id,external_order_id" },
  );

  return {
    pedidoId,
    skippedItems,
    totalItems: lineItems.length,
    createdItems: isUpdate ? 0 : itemsToInsert.length,
    updatedItems: isUpdate ? itemsToInsert.length : 0,
    failedItems,
  };
}

async function processWooImportJobs(params: {
  admin: any;
  userId: string;
  ecommerceId: string;
  empresaId: string;
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  since: string | null;
}) {
  const { admin, userId, ecommerceId, empresaId, storeUrl, consumerKey, consumerSecret } = params;
  const { data: claimed } = await admin.rpc("ecommerce_import_jobs_claim", {
    p_provider: "woo",
    p_limit: 1,
    p_worker: "marketplaces-sync-woo",
  });

  const jobs = Array.isArray(claimed) ? claimed : [];
  if (jobs.length === 0) {
    return {
      processed_jobs: 0,
      imported_orders: 0,
      total_items: 0,
      skipped_items: 0,
      failed_items: 0,
    };
  }

  let processedJobs = 0;
  let importedOrders = 0;
  let totalItems = 0;
  let skippedItems = 0;
  let failedItems = 0;
  let hadErrors = false;
  let lastError: string | null = null;
  for (const job of jobs) {
    const jobId = String(job.id);
    const payload = (job?.payload && typeof job.payload === "object" && !Array.isArray(job.payload)) ? job.payload : {};
    const payloadFrom = toIsoOrNull((payload as any).from) ?? toIsoOrNull((payload as any).since);
    const windowFrom = payloadFrom ?? params.since ?? minusDaysIso(7);
    const { data: run } = await admin.from("ecommerce_job_runs").insert({
      empresa_id: empresaId,
      job_id: jobId,
      provider: "woo",
      kind: "import_orders",
      started_at: new Date().toISOString(),
      meta: { from: windowFrom },
    }).select("id").single();
    const runId = run?.id ? String(run.id) : null;

    try {
      let page = 1;
      const perPage = 50;
      while (true) {
        const url = buildWooOrdersUrl({ storeUrl, consumerKey, consumerSecret, afterIso: windowFrom, page, perPage });
        const resp = await wooFetchJson(url);
        if (!resp.ok) throw new Error(`WOO_ORDERS_FAILED:${resp.status}`);
        const orders = Array.isArray(resp.data) ? resp.data : [];
        if (orders.length === 0) break;

        for (const order of orders) {
          const result = await upsertPedidoFromWooOrder({
            admin,
            empresaId,
            ecommerceId,
            order,
            runId,
            jobId,
          });
          if (result.pedidoId) importedOrders += 1;
          totalItems += result.totalItems;
          skippedItems += result.skippedItems;
          failedItems += result.failedItems;
        }
        if (orders.length < perPage) break;
        page += 1;
      }

      await admin.from("ecommerce_jobs").update({
        status: "done",
        locked_at: null,
        locked_by: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
      if (runId) {
        await admin.from("ecommerce_job_runs").update({
          ok: true,
          finished_at: new Date().toISOString(),
          meta: { from: windowFrom, imported_orders: importedOrders, total_items: totalItems, skipped_items: skippedItems, failed_items: failedItems },
        }).eq("id", runId);
      }
      processedJobs += 1;
    } catch (jobErr: any) {
      const message = jobErr?.message || "WOO_IMPORT_JOB_FAILED";
      hadErrors = true;
      lastError = message;
      await admin.from("ecommerce_jobs").update({
        status: "error",
        locked_at: null,
        locked_by: null,
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
      if (runId) {
        await admin.from("ecommerce_job_runs").update({
          ok: false,
          finished_at: new Date().toISOString(),
          error: message,
          meta: { from: windowFrom },
        }).eq("id", runId);
      }
    }
  }

  await admin.from("ecommerces").update({
    last_sync_at: new Date().toISOString(),
    last_error: hadErrors ? lastError : null,
    status: hadErrors ? "error" : "connected",
    updated_at: new Date().toISOString(),
  }).eq("id", ecommerceId);

  return {
    processed_jobs: processedJobs,
    imported_orders: importedOrders,
    total_items: totalItems,
    skipped_items: skippedItems,
    failed_items: failedItems,
  };
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: me } = await user.auth.getUser();
  const userId = me?.user?.id;
  if (!userId) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const allowed = await canManageEcommerce(user);
  if (!allowed) return json(403, { ok: false, error: "FORBIDDEN_RBAC" }, cors);

  const body = (await req.json().catch(() => ({}))) as Body;
  const provider = (body.provider ?? "meli") as Provider;
  const action = (body.action ?? "import_orders") as Action;
  const since = toIsoOrNull(body.since) ?? null;

  if (provider !== "meli" && provider !== "shopee" && provider !== "woo") return json(400, { ok: false, error: "INVALID_PROVIDER" }, cors);
  if (action !== "import_orders") return json(400, { ok: false, error: "INVALID_ACTION" }, cors);

  if (provider === "shopee") return json(501, { ok: false, provider: "shopee", error: "NOT_IMPLEMENTED_YET" }, cors);

  // Conexão
  const { data: conn } = await admin
    .from("ecommerces")
    .select("id,empresa_id,provider,status,external_account_id,active_account_id,last_sync_at,config")
    .eq("provider", provider)
    .limit(1)
    .maybeSingle();

  if (!conn?.id || !conn?.empresa_id) return json(404, { ok: false, error: "NOT_CONNECTED" }, cors);
  const ecommerceId = String(conn.id);
  const empresaId = String(conn.empresa_id);

  const { data: sec } = await admin
    .from("ecommerce_connection_secrets")
    .select("access_token,refresh_token,token_expires_at,token_scopes,token_type,woo_consumer_key,woo_consumer_secret")
    .eq("ecommerce_id", ecommerceId)
    .maybeSingle();

  let accessToken = sec?.access_token ? String(sec.access_token) : "";
  const refreshToken = sec?.refresh_token ? String(sec.refresh_token) : "";
  const tokenScopes = sec?.token_scopes != null ? String(sec.token_scopes) : null;
  const tokenType = sec?.token_type != null ? String(sec.token_type) : null;
  const wooConsumerKey = sec?.woo_consumer_key ? String(sec.woo_consumer_key) : "";
  const wooConsumerSecret = sec?.woo_consumer_secret ? String(sec.woo_consumer_secret) : "";
  const expiresAtIso = toIsoOrNull(sec?.token_expires_at);
  const expired = expiresAtIso ? new Date(expiresAtIso).getTime() <= Date.now() + 60000 : false;

  // Circuit breaker: avoid cascades when provider is unstable
  const cb = await circuitBreakerShouldAllow({ admin, empresaId, domain: "ecommerce", provider });
  if (!cb.allowed) {
    const retryAt = cb.next_retry_at;
    return json(
      503,
      {
        ok: false,
        provider,
        error: "CIRCUIT_OPEN",
        next_retry_at: retryAt,
        retry_after_seconds: retryAfterSeconds(retryAt),
      },
      cors,
    );
  }

  // Rate limit: avoid bursts (per company) on manual import
  const rl = await rateLimitCheck({
    admin,
    empresaId,
    domain: "ecommerce",
    action: "import_orders",
    limit: 3,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return json(
      429,
      {
        ok: false,
        provider,
        error: "RATE_LIMITED",
        retry_after_seconds: rl.retry_after_seconds,
      },
      cors,
    );
  }

  // Bulkhead: prevent concurrent long imports (best-effort)
  const inflightCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: inflight } = await admin
    .from("ecommerce_jobs")
    .select("id,dedupe_key,locked_at")
    .eq("empresa_id", empresaId)
    .eq("provider", provider)
    .eq("kind", "import_orders")
    .eq("status", "processing")
    .gte("locked_at", inflightCutoff)
    .limit(1)
    .maybeSingle();
  if (inflight?.id) {
    return json(
      409,
      {
        ok: false,
        provider,
        error: "ALREADY_RUNNING",
        job_id: String(inflight.id),
        locked_at: inflight.locked_at ?? null,
      },
      cors,
    );
  }

  if (provider === "woo") {
    const rawStoreUrl = String((conn as any)?.config?.store_url ?? "").trim();
    if (!rawStoreUrl) return json(409, { ok: false, provider: "woo", error: "MISSING_STORE_URL" }, cors);
    if (!wooConsumerKey || !wooConsumerSecret) {
      return json(409, { ok: false, provider: "woo", error: "MISSING_WOO_CREDENTIALS" }, cors);
    }
    const storeUrl = normalizeStoreUrl(rawStoreUrl);
    try {
      const result = await processWooImportJobs({
        admin,
        userId,
        ecommerceId,
        empresaId,
        storeUrl,
        consumerKey: wooConsumerKey,
        consumerSecret: wooConsumerSecret,
        since,
      });
      await circuitBreakerRecord({ admin, empresaId, domain: "ecommerce", provider, ok: true });
      await finopsTrackUsage({ admin, empresaId, source: "ecommerce", event: "woo.import_orders", count: result.imported_orders });
      await finopsTrackUsage({ admin, empresaId, source: "ecommerce", event: "woo.job_run", count: result.processed_jobs });
      return json(
        200,
        {
          ok: true,
          provider: "woo",
          processed_jobs: result.processed_jobs,
          imported: result.imported_orders,
          total_items: result.total_items,
          skipped_items: result.skipped_items,
          failed_items: result.failed_items,
        },
        cors,
      );
    } catch (err: any) {
      const message = err?.message || "WOO_IMPORT_FAILED";
      await circuitBreakerRecord({ admin, empresaId, domain: "ecommerce", provider, ok: false, error: message });
      await finopsTrackUsage({ admin, empresaId, source: "ecommerce", event: "woo.import_failed", count: 1 });
      return json(502, { ok: false, provider: "woo", error: message }, cors);
    }
  }

  if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET) return json(500, { ok: false, error: "MISSING_MELI_SECRETS" }, cors);
  let sellerId = conn.external_account_id ? String(conn.external_account_id) : "";
  if (conn.active_account_id) {
    const { data: acct } = await admin.from("ecommerce_accounts").select("external_account_id").eq("id", conn.active_account_id).maybeSingle();
    if (acct?.external_account_id) sellerId = String(acct.external_account_id);
  }
  if (!sellerId) return json(409, { ok: false, error: "MISSING_SELLER_ID" }, cors);

  let tokenRefreshCalls = 0;
  let searchCalls = 0;
  let orderDetailCalls = 0;

  if ((!accessToken || expired) && refreshToken) {
    const r = await refreshMeliToken({ refreshToken });
    if (!r.ok) {
      await circuitBreakerRecord({ admin, empresaId, domain: "ecommerce", provider, ok: false, error: `MELI_REFRESH_FAILED:${r.status}` });
      return json(502, { ok: false, error: "MELI_REFRESH_FAILED", status: r.status, data: sanitizeForLog(r.data) }, cors);
    }
    tokenRefreshCalls += 1;
    accessToken = String(r.data?.access_token ?? "");
    const newRefresh = String(r.data?.refresh_token ?? refreshToken);
    const expiresIn = Number(r.data?.expires_in ?? 0);
    const newExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    await admin.from("ecommerce_connection_secrets").upsert(
      { empresa_id: empresaId, ecommerce_id: ecommerceId, access_token: accessToken || null, refresh_token: newRefresh || null, token_expires_at: newExpiresAt },
      { onConflict: "ecommerce_id" },
    );
  }

  if (!accessToken) return json(409, { ok: false, error: "MISSING_ACCESS_TOKEN" }, cors);

  const windowFrom = since ?? toIsoOrNull(conn.last_sync_at) ?? minusDaysIso(7);
  const windowTo = plusDaysIso(0);
  const adapterVersion = await getAdapterVersion({ admin, empresaId, provider: "meli", kind: "import_orders" });

  // Cria job/run (observabilidade)
  const jobDedupe = `meli_import_orders:${windowFrom.slice(0, 13)}`; // hora
  const { data: job } = await admin.from("ecommerce_jobs").upsert(
    {
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "meli",
      kind: "import_orders",
      dedupe_key: jobDedupe,
      payload: { from: windowFrom, to: windowTo },
      adapter_version: adapterVersion,
      status: "processing",
      attempts: 1,
      locked_at: new Date().toISOString(),
      locked_by: "marketplaces-sync",
      created_by: userId,
    },
    { onConflict: "provider,dedupe_key" },
  ).select("id").maybeSingle();

  const jobId = job?.id ? String(job.id) : null;
  const { data: run } = await admin.from("ecommerce_job_runs").insert({
    empresa_id: empresaId,
    job_id: jobId,
    provider: "meli",
    kind: "import_orders",
    adapter_version: adapterVersion,
    meta: { from: windowFrom, to: windowTo },
  }).select("id").single();
  const runId = run?.id ? String(run.id) : null;

  const limit = 50;
  let offset = 0;
  let imported = 0;
  let skippedItemsTotal = 0;
  let totalItems = 0;

  try {
    while (true) {
      const q = new URL("https://api.mercadolibre.com/orders/search");
      q.searchParams.set("seller", sellerId);
      q.searchParams.set("order.date_created.from", windowFrom);
      q.searchParams.set("order.date_created.to", windowTo);
      q.searchParams.set("limit", String(limit));
      q.searchParams.set("offset", String(offset));

      searchCalls += 1;
      const page = await meliFetchJson(q.toString(), accessToken);
      if (!page.ok) throw new Error(`MELI_SEARCH_FAILED:${page.status}`);
      const results = Array.isArray(page.data?.results) ? page.data.results : [];
      if (results.length === 0) break;

      for (const r of results) {
        const orderId = r?.id != null ? String(r.id) : null;
        if (!orderId) continue;
        orderDetailCalls += 1;
        const detail = await meliFetchJson(`https://api.mercadolibre.com/orders/${encodeURIComponent(orderId)}`, accessToken);
        if (!detail.ok) {
          await admin.from("ecommerce_logs").insert({
            empresa_id: empresaId,
            ecommerce_id: ecommerceId,
            provider: "meli",
            level: "error",
            event: "meli_order_fetch_failed",
            message: `Falha ao buscar pedido ${orderId}`,
            entity_type: "order",
            entity_external_id: orderId,
            run_id: runId,
            context: sanitizeForLog({ status: detail.status, data: detail.data }),
          });
          continue;
        }

        const res = await upsertPedidoFromMeliOrder({ admin, empresaId, ecommerceId, order: detail.data });
        imported += res.pedidoId ? 1 : 0;
        skippedItemsTotal += res.skippedItems;
        totalItems += res.totalItems;

        if (res.skippedItems > 0) {
          await admin.from("ecommerce_logs").insert({
            empresa_id: empresaId,
            ecommerce_id: ecommerceId,
            provider: "meli",
            level: "warn",
            event: "meli_order_items_unmapped",
            message: `Pedido ${orderId}: ${res.skippedItems}/${res.totalItems} itens sem mapeamento (produto_anuncios)`,
            entity_type: "order",
            entity_external_id: orderId,
            entity_id: res.pedidoId,
            run_id: runId,
            context: { skipped: res.skippedItems, total: res.totalItems },
          });
        }
      }

      offset += results.length;
      if (results.length < limit) break;
    }

    await admin.from("ecommerces").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", ecommerceId);
    if (jobId) await admin.from("ecommerce_jobs").update({ status: "done", locked_at: null, locked_by: null, last_error: null }).eq("id", jobId);
    if (runId) await admin.from("ecommerce_job_runs").update({ ok: true, finished_at: new Date().toISOString() }).eq("id", runId);

    await admin.from("ecommerce_logs").insert({
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "meli",
      level: "info",
      event: "meli_import_audit",
      message: `Importação concluída: ${imported} pedidos (itens: ${totalItems}, skipped: ${skippedItemsTotal})`,
      entity_type: "run",
      entity_id: runId,
      run_id: runId,
      context: sanitizeForLog({
        from: windowFrom,
        to: windowTo,
        token_refresh_calls: tokenRefreshCalls,
        search_calls: searchCalls,
        order_detail_calls: orderDetailCalls,
        token_scopes: tokenScopes,
        token_type: tokenType,
      }),
    });

    await circuitBreakerRecord({ admin, empresaId, domain: "ecommerce", provider, ok: true });

    // FINOPS (best-effort): volume importado e runs do job.
    await finopsTrackUsage({ admin, empresaId, source: "ecommerce", event: "meli.import_orders", count: imported });
    await finopsTrackUsage({ admin, empresaId, source: "ecommerce", event: "meli.job_run", count: 1 });

    return json(200, { ok: true, provider: "meli", imported, total_items: totalItems, skipped_items: skippedItemsTotal, from: windowFrom, to: windowTo }, cors);
  } catch (e: any) {
    const msg = e?.message || "MELI_IMPORT_FAILED";
    if (jobId) await admin.from("ecommerce_jobs").update({ status: "error", locked_at: null, locked_by: null, last_error: msg }).eq("id", jobId);
    if (runId) await admin.from("ecommerce_job_runs").update({ ok: false, finished_at: new Date().toISOString(), error: msg }).eq("id", runId);
    await admin.from("ecommerces").update({ status: "error", last_error: msg }).eq("id", ecommerceId);
    await circuitBreakerRecord({ admin, empresaId, domain: "ecommerce", provider, ok: false, error: msg });

    await finopsTrackUsage({ admin, empresaId, source: "ecommerce", event: "meli.import_failed", count: 1 });
    return json(502, { ok: false, provider: "meli", error: msg }, cors);
  }
});
