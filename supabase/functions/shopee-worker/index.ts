/**
 * shopee-worker — Background job processor for Shopee integration
 *
 * Picks jobs from `ecommerce_jobs` WHERE provider='shopee' via RPC (FOR UPDATE SKIP LOCKED):
 *   - import_orders: import orders from Shopee (webhook-triggered or scheduled)
 *   - sync_stock: sync stock for published items (with auto-pause guardrail)
 *   - sync_prices: sync prices for published items
 *
 * Triggered by: shopee-scheduler (cron), shopee-webhook (notifications), or shopee-admin
 * Auth: Service key (verify_jwt = false)
 */

import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { trackRequestId } from "../_shared/request.ts";
import {
  buildShopeeUrl,
  shopeeFetchJson,
  shopeePostJson,
  refreshShopeeToken,
  backoffMs,
  shouldPauseOnZeroStock,
} from "../_shared/shopeeHardening.ts";
import { upsertPedidoFromShopeeOrder } from "../_shared/shopeeOrderImport.ts";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SHOPEE_PARTNER_ID = Deno.env.get("SHOPEE_PARTNER_ID") ?? "";
const SHOPEE_PARTNER_KEY = Deno.env.get("SHOPEE_PARTNER_KEY") ?? "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface JobRow {
  id: string;
  empresa_id: string;
  ecommerce_id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Token management (10min buffer — Shopee token lasts only 4h)
// ---------------------------------------------------------------------------
async function ensureToken(admin: any, ecommerceId: string): Promise<{ accessToken: string; shopId: string }> {
  const { data: sec } = await admin
    .from("ecommerce_connection_secrets")
    .select("access_token,refresh_token,token_expires_at")
    .eq("ecommerce_id", ecommerceId)
    .maybeSingle();

  const { data: conn } = await admin
    .from("ecommerces")
    .select("external_account_id")
    .eq("id", ecommerceId)
    .maybeSingle();

  const shopId = conn?.external_account_id ? String(conn.external_account_id) : "";
  if (!shopId) throw new Error("MISSING_SHOP_ID");

  let accessToken = sec?.access_token ? String(sec.access_token) : "";
  const refreshTokenStr = sec?.refresh_token ? String(sec.refresh_token) : "";
  const expiresAt = sec?.token_expires_at ? new Date(sec.token_expires_at) : null;
  const expired = expiresAt ? expiresAt.getTime() <= Date.now() + 10 * 60 * 1000 : false;

  if ((!accessToken || expired) && refreshTokenStr) {
    const r = await refreshShopeeToken({
      partnerId: SHOPEE_PARTNER_ID,
      partnerKey: SHOPEE_PARTNER_KEY,
      refreshToken: refreshTokenStr,
      shopId,
    });
    if (!r.ok) throw new Error(`TOKEN_REFRESH_FAILED:${r.status}`);
    accessToken = String(r.data?.access_token ?? "");
    const newRefresh = String(r.data?.refresh_token ?? refreshTokenStr);
    const expiresIn = Number(r.data?.expire_in ?? 0);
    const newExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    await admin.from("ecommerce_connection_secrets").upsert(
      {
        ecommerce_id: ecommerceId,
        access_token: accessToken || null,
        refresh_token: newRefresh || null,
        token_expires_at: newExpiresAt,
      },
      { onConflict: "ecommerce_id" },
    );
  }

  if (!accessToken) throw new Error("NO_ACCESS_TOKEN");
  return { accessToken, shopId };
}

// ---------------------------------------------------------------------------
// Job processors
// ---------------------------------------------------------------------------

async function processImportOrders(
  admin: any,
  job: JobRow,
  accessToken: string,
  shopId: string,
): Promise<{ imported: number; skipped: number }> {
  const payload = job.payload ?? {};
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const orderSn = data.ordersn ? String(data.ordersn) : null;

  let ordersToProcess: any[] = [];

  if (orderSn) {
    // Webhook-triggered: import specific order
    const url = await buildShopeeUrl({
      path: "/api/v2/order/get_order_detail",
      partnerId: SHOPEE_PARTNER_ID,
      partnerKey: SHOPEE_PARTNER_KEY,
      accessToken,
      shopId,
      extra: {
        order_sn_list: orderSn,
        response_optional_fields: "buyer_user_id,buyer_username,item_list,actual_shipping_fee,estimated_shipping_fee",
      },
    });
    const detail = await shopeeFetchJson(url);
    if (!detail.ok) throw new Error(`SHOPEE_ORDER_DETAIL_FAILED:${detail.status}`);
    const orderList = detail.data?.response?.order_list ?? [];
    ordersToProcess = Array.isArray(orderList) ? orderList : [];
  } else {
    // Scheduled/manual: import last 24h
    const timeTo = Math.floor(Date.now() / 1000);
    const timeFrom = timeTo - 86400;

    const url = await buildShopeeUrl({
      path: "/api/v2/order/get_order_list",
      partnerId: SHOPEE_PARTNER_ID,
      partnerKey: SHOPEE_PARTNER_KEY,
      accessToken,
      shopId,
      extra: {
        time_range_field: "create_time",
        time_from: String(timeFrom),
        time_to: String(timeTo),
        page_size: "100",
        response_optional_fields: "order_status",
      },
    });
    const page = await shopeeFetchJson(url);
    if (!page.ok) throw new Error(`SHOPEE_ORDER_LIST_FAILED:${page.status}`);

    const orderSnList = (page.data?.response?.order_list ?? [])
      .map((o: any) => o?.order_sn)
      .filter(Boolean);

    // Fetch details in batches of 50
    for (let i = 0; i < orderSnList.length; i += 50) {
      const batch = orderSnList.slice(i, i + 50);
      const detailUrl = await buildShopeeUrl({
        path: "/api/v2/order/get_order_detail",
        partnerId: SHOPEE_PARTNER_ID,
        partnerKey: SHOPEE_PARTNER_KEY,
        accessToken,
        shopId,
        extra: {
          order_sn_list: batch.join(","),
          response_optional_fields: "buyer_user_id,buyer_username,item_list,actual_shipping_fee,estimated_shipping_fee",
        },
      });
      const detailResp = await shopeeFetchJson(detailUrl);
      if (detailResp.ok) {
        const list = detailResp.data?.response?.order_list ?? [];
        ordersToProcess.push(...(Array.isArray(list) ? list : []));
      }
      await sleep(100);
    }
  }

  let imported = 0;
  let skipped = 0;
  for (const order of ordersToProcess) {
    const res = await upsertPedidoFromShopeeOrder({
      admin,
      empresaId: job.empresa_id,
      ecommerceId: job.ecommerce_id,
      order,
    });
    if (res.pedidoId) imported++;
    skipped += res.skippedItems;
  }
  return { imported, skipped };
}

async function processStockSync(
  admin: any,
  job: JobRow,
  accessToken: string,
  shopId: string,
): Promise<{ updated: number; paused: number; failed: number }> {
  const { data: conn } = await admin
    .from("ecommerces")
    .select("config")
    .eq("id", job.ecommerce_id)
    .maybeSingle();
  const config = (conn?.config ?? {}) as Record<string, unknown>;

  const { data: anuncios } = await admin
    .from("produto_anuncios")
    .select("id,produto_id,identificador_externo")
    .eq("empresa_id", job.empresa_id)
    .eq("ecommerce_id", job.ecommerce_id)
    .not("identificador_externo", "is", null)
    .limit(200);

  let updated = 0;
  let paused = 0;
  let failed = 0;

  for (const a of anuncios ?? []) {
    const { data: prod } = await admin
      .from("produtos")
      .select("estoque_disponivel,estoque_atual")
      .eq("id", a.produto_id)
      .maybeSingle();
    const qty = Math.max(0, Math.trunc(Number(prod?.estoque_disponivel ?? prod?.estoque_atual ?? 0)));

    if (shouldPauseOnZeroStock(qty, config)) {
      paused++;
      await admin.from("produto_anuncios").update({
        sync_status: "paused",
        last_sync_at: new Date().toISOString(),
        last_error: "auto_pause_zero_stock",
      }).eq("id", a.id);
    } else {
      // Shopee stock update: POST /api/v2/product/update_stock
      const itemId = Number(a.identificador_externo);
      const url = await buildShopeeUrl({
        path: "/api/v2/product/update_stock",
        partnerId: SHOPEE_PARTNER_ID,
        partnerKey: SHOPEE_PARTNER_KEY,
        accessToken,
        shopId,
      });
      const r = await shopeePostJson(url, {
        item_id: itemId,
        stock_list: [{ model_id: 0, normal_stock: qty }],
      });
      if (r.ok) {
        updated++;
        await admin.from("produto_anuncios").update({
          sync_status: "synced",
          last_sync_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", a.id);
      } else {
        failed++;
        await admin.from("produto_anuncios").update({
          sync_status: "error",
          last_sync_at: new Date().toISOString(),
          last_error: String(r.data?.message || r.data?.error || `HTTP ${r.status}`).slice(0, 500),
        }).eq("id", a.id);
      }
    }
    await sleep(100);
  }
  return { updated, paused, failed };
}

async function processPriceSync(
  admin: any,
  job: JobRow,
  accessToken: string,
  shopId: string,
): Promise<{ updated: number; failed: number }> {
  const { data: anuncios } = await admin
    .from("produto_anuncios")
    .select("id,produto_id,identificador_externo,preco_especifico")
    .eq("empresa_id", job.empresa_id)
    .eq("ecommerce_id", job.ecommerce_id)
    .not("identificador_externo", "is", null)
    .limit(200);

  let updated = 0;
  let failed = 0;

  for (const a of anuncios ?? []) {
    const { data: prod } = await admin
      .from("produtos")
      .select("preco_venda,preco_promocional")
      .eq("id", a.produto_id)
      .maybeSingle();
    const price = Number(a.preco_especifico ?? prod?.preco_promocional ?? prod?.preco_venda ?? 0);
    if (price <= 0) { failed++; continue; }

    const itemId = Number(a.identificador_externo);
    const url = await buildShopeeUrl({
      path: "/api/v2/product/update_price",
      partnerId: SHOPEE_PARTNER_ID,
      partnerKey: SHOPEE_PARTNER_KEY,
      accessToken,
      shopId,
    });
    const r = await shopeePostJson(url, {
      item_id: itemId,
      price_list: [{ model_id: 0, original_price: price }],
    });
    if (r.ok) {
      updated++;
      await admin.from("produto_anuncios").update({
        sync_status: "synced",
        last_sync_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", a.id);
    } else {
      failed++;
      await admin.from("produto_anuncios").update({
        sync_status: "error",
        last_sync_at: new Date().toISOString(),
        last_error: String(r.data?.message || r.data?.error || `HTTP ${r.status}`).slice(0, 500),
      }).eq("id", a.id);
    }
    await sleep(100);
  }
  return { updated, failed };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  trackRequestId(req);

  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { ok: false, error: "MISSING_ENV" }, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Claim pending jobs
  const { data: jobs, error: jobsErr } = await admin.rpc("ecommerce_import_jobs_claim", {
    p_provider: "shopee",
    p_limit: 10,
    p_worker: "shopee-worker",
  });

  if (jobsErr || !jobs?.length) {
    return json(200, { ok: true, processed: 0, hint: "No pending Shopee jobs" }, cors);
  }

  let processed = 0;
  let errors = 0;

  for (const job of jobs) {
    const jobId = String(job.id);
    const attempt = job.attempts ?? 1;

    const { data: run } = await admin.from("ecommerce_job_runs").insert({
      empresa_id: job.empresa_id,
      job_id: jobId,
      provider: "shopee",
      kind: job.kind,
      meta: job.payload,
    }).select("id").single();
    const runId = run?.id ? String(run.id) : null;

    try {
      const { accessToken, shopId } = await ensureToken(admin, job.ecommerce_id);
      let result: Record<string, unknown> = {};

      switch (job.kind) {
        case "import_orders":
          result = await processImportOrders(admin, job as JobRow, accessToken, shopId);
          break;
        case "sync_stock":
          result = await processStockSync(admin, job as JobRow, accessToken, shopId);
          break;
        case "sync_prices":
          result = await processPriceSync(admin, job as JobRow, accessToken, shopId);
          break;
        default:
          throw new Error(`UNSUPPORTED_JOB_KIND: ${job.kind}`);
      }

      // Success
      await admin.from("ecommerce_jobs").update({
        status: "done",
        locked_at: null,
        locked_by: null,
        last_error: null,
      }).eq("id", jobId);

      if (runId) {
        await admin.from("ecommerce_job_runs").update({
          ok: true,
          finished_at: new Date().toISOString(),
          meta: { ...job.payload, result },
        }).eq("id", runId);
      }

      await admin.from("ecommerce_logs").insert({
        empresa_id: job.empresa_id,
        ecommerce_id: job.ecommerce_id,
        provider: "shopee",
        level: "info",
        event: `shopee_worker_${job.kind}_done`,
        message: `Job ${job.kind} concluído`,
        entity_type: "job",
        entity_id: jobId,
        run_id: runId,
        context: sanitizeForLog(result),
      }).catch(() => {});

      processed++;
    } catch (e: any) {
      const msg = String(e?.message || "WORKER_ERROR").slice(0, 500);
      errors++;

      const maxAttempts = job.max_attempts ?? 5;
      if (attempt >= maxAttempts) {
        await admin.from("ecommerce_jobs").update({
          status: "dead",
          locked_at: null,
          locked_by: null,
          last_error: msg,
        }).eq("id", jobId);

        await admin.from("ecommerce_job_dead_letters").insert({
          empresa_id: job.empresa_id,
          job_id: jobId,
          provider: "shopee",
          kind: job.kind,
          dedupe_key: null,
          payload: job.payload ?? {},
          last_error: msg,
        }).catch(() => {});
      } else {
        const delayMs = backoffMs(attempt);
        const nextRetry = new Date(Date.now() + delayMs).toISOString();
        await admin.from("ecommerce_jobs").update({
          status: "pending",
          locked_at: null,
          locked_by: null,
          last_error: msg,
          next_retry_at: nextRetry,
        }).eq("id", jobId);
      }

      if (runId) {
        await admin.from("ecommerce_job_runs").update({
          ok: false,
          finished_at: new Date().toISOString(),
          error: msg,
        }).eq("id", runId);
      }

      await admin.from("ecommerce_logs").insert({
        empresa_id: job.empresa_id,
        ecommerce_id: job.ecommerce_id,
        provider: "shopee",
        level: "error",
        event: `shopee_worker_${job.kind}_failed`,
        message: `Job ${job.kind} falhou (attempt ${attempt}/${maxAttempts}): ${msg}`,
        entity_type: "job",
        entity_id: jobId,
        run_id: runId,
        context: sanitizeForLog({ error: msg, attempt, max: maxAttempts }),
      }).catch(() => {});
    }
  }

  return json(200, { ok: true, processed, errors, total_jobs: jobs.length }, cors);
});
