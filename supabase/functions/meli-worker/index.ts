/**
 * meli-worker — Background job processor for Mercado Livre integration
 *
 * Picks jobs from `ecommerce_jobs` WHERE provider='meli' via RPC (FOR UPDATE SKIP LOCKED):
 *   - sync_stock: sync stock for published items (with auto-pause guardrail)
 *   - sync_prices: sync prices for published items
 *   - import_orders: import orders from ML (webhook-triggered or scheduled)
 *   - sync_item: refresh single ML item status
 *   - sync_questions: fetch unanswered questions
 *
 * Triggered by: meli-scheduler (cron), meli-webhook (notifications), or meli-admin
 * Auth: Service key (verify_jwt = false)
 */

import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { trackRequestId } from "../_shared/request.ts";
import {
  MELI_API_BASE,
  meliFetchJson,
  meliPutJson,
  refreshMeliToken,
  backoffMs,
  shouldPauseOnZeroStock,
} from "../_shared/meliHardening.ts";
import { upsertPedidoFromMeliOrder } from "../_shared/meliOrderImport.ts";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MELI_CLIENT_ID = Deno.env.get("MELI_CLIENT_ID") ?? "";
const MELI_CLIENT_SECRET = Deno.env.get("MELI_CLIENT_SECRET") ?? "";

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
  locked_at: string | null;
  next_retry_at: string | null;
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
// Token management
// ---------------------------------------------------------------------------
async function ensureToken(admin: any, ecommerceId: string): Promise<string> {
  const { data: sec } = await admin
    .from("ecommerce_connection_secrets")
    .select("access_token,refresh_token,token_expires_at")
    .eq("ecommerce_id", ecommerceId)
    .maybeSingle();

  let accessToken = sec?.access_token ? String(sec.access_token) : "";
  const refreshTokenStr = sec?.refresh_token ? String(sec.refresh_token) : "";
  const expiresAt = sec?.token_expires_at ? new Date(sec.token_expires_at) : null;
  const expired = expiresAt ? expiresAt.getTime() <= Date.now() + 5 * 60 * 1000 : false;

  if ((!accessToken || expired) && refreshTokenStr) {
    const r = await refreshMeliToken({
      clientId: MELI_CLIENT_ID,
      clientSecret: MELI_CLIENT_SECRET,
      refreshToken: refreshTokenStr,
    });
    if (!r.ok) throw new Error(`TOKEN_REFRESH_FAILED:${r.status}`);
    accessToken = String(r.data?.access_token ?? "");
    const newRefresh = String(r.data?.refresh_token ?? refreshTokenStr);
    const expiresIn = Number(r.data?.expires_in ?? 0);
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
  return accessToken;
}

// ---------------------------------------------------------------------------
// Job processors
// ---------------------------------------------------------------------------

async function processStockSync(
  admin: any,
  job: JobRow,
  token: string,
): Promise<{ updated: number; paused: number; failed: number }> {
  // Load ecommerce config for stock threshold
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
      // Auto-pause listing instead of pushing qty=0
      const pauseResult = await meliPutJson(
        `${MELI_API_BASE}/items/${encodeURIComponent(a.identificador_externo)}`,
        token,
        { status: "paused" },
      );
      if (pauseResult.ok) {
        paused++;
        await admin.from("produto_anuncios").update({
          sync_status: "paused",
          last_sync_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", a.id);
      } else {
        failed++;
        await admin.from("produto_anuncios").update({
          sync_status: "error",
          last_sync_at: new Date().toISOString(),
          last_error: `auto_pause_failed:HTTP ${pauseResult.status}`,
        }).eq("id", a.id);
      }
    } else {
      // Normal stock push
      const r = await meliPutJson(
        `${MELI_API_BASE}/items/${encodeURIComponent(a.identificador_externo)}`,
        token,
        { available_quantity: qty },
      );
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
          last_error: String(r.data?.message || `HTTP ${r.status}`).slice(0, 500),
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
  token: string,
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
    const r = await meliPutJson(
      `${MELI_API_BASE}/items/${encodeURIComponent(a.identificador_externo)}`,
      token,
      { price },
    );
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
        last_error: String(r.data?.message || `HTTP ${r.status}`).slice(0, 500),
      }).eq("id", a.id);
    }
    await sleep(100);
  }
  return { updated, failed };
}

async function processImportOrders(
  admin: any,
  job: JobRow,
  token: string,
): Promise<{ imported: number; skipped: number }> {
  const payload = job.payload ?? {};
  const resource = String(payload.resource ?? "").trim();

  let ordersToProcess: any[] = [];

  if (resource && resource.startsWith("/orders/")) {
    // Webhook-triggered: import specific order
    const orderId = resource.replace("/orders/", "").split("/")[0];
    if (!orderId) throw new Error("INVALID_ORDER_RESOURCE");

    const detail = await meliFetchJson(
      `${MELI_API_BASE}/orders/${encodeURIComponent(orderId)}`,
      token,
    );
    if (!detail.ok) throw new Error(`MELI_ORDER_FETCH_FAILED:${detail.status}`);
    ordersToProcess = [detail.data];
  } else {
    // Scheduled/manual: import last 24h
    const from = new Date(Date.now() - 86400 * 1000).toISOString();
    const to = new Date().toISOString();

    const { data: conn } = await admin
      .from("ecommerces")
      .select("external_account_id")
      .eq("id", job.ecommerce_id)
      .maybeSingle();
    const sellerId = conn?.external_account_id ? String(conn.external_account_id) : null;
    if (!sellerId) throw new Error("MISSING_SELLER_ID");

    const q = new URL(`${MELI_API_BASE}/orders/search`);
    q.searchParams.set("seller", sellerId);
    q.searchParams.set("order.date_created.from", from);
    q.searchParams.set("order.date_created.to", to);
    q.searchParams.set("limit", "50");

    const page = await meliFetchJson(q.toString(), token);
    if (!page.ok) throw new Error(`MELI_SEARCH_FAILED:${page.status}`);
    ordersToProcess = Array.isArray(page.data?.results) ? page.data.results : [];
  }

  let imported = 0;
  let skipped = 0;

  for (const order of ordersToProcess) {
    const res = await upsertPedidoFromMeliOrder({
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

async function processSyncItem(
  admin: any,
  job: JobRow,
  token: string,
): Promise<{ synced: boolean }> {
  const rawResource = String(job.payload?.resource ?? "").trim();
  const mlItemId = rawResource.replace(/^\/items\//, "").split("/")[0];
  if (!mlItemId) throw new Error("MISSING_ML_ITEM_ID");

  const result = await meliFetchJson(
    `${MELI_API_BASE}/items/${encodeURIComponent(mlItemId)}`,
    token,
  );
  if (!result.ok) throw new Error(`MELI_ITEM_FETCH_FAILED:${result.status}`);

  const item = result.data;
  const statusMap: Record<string, string> = {
    active: "publicado",
    paused: "pausado",
    closed: "inativo",
    under_review: "rascunho",
  };

  await admin
    .from("produto_anuncios")
    .update({
      sync_status: "synced",
      last_sync_at: new Date().toISOString(),
      last_error: null,
      url_anuncio: item.permalink ?? null,
      status_anuncio: statusMap[item.status] ?? "rascunho",
    })
    .eq("empresa_id", job.empresa_id)
    .eq("ecommerce_id", job.ecommerce_id)
    .eq("identificador_externo", mlItemId);

  return { synced: true };
}

async function processSyncQuestions(
  admin: any,
  job: JobRow,
  token: string,
): Promise<{ fetched: number }> {
  const { data: conn } = await admin
    .from("ecommerces")
    .select("external_account_id")
    .eq("id", job.ecommerce_id)
    .maybeSingle();
  const sellerId = conn?.external_account_id ? String(conn.external_account_id) : null;
  if (!sellerId) throw new Error("MISSING_SELLER_ID");

  const url = `${MELI_API_BASE}/questions/search?seller_id=${encodeURIComponent(sellerId)}&status=UNANSWERED&limit=50`;
  const result = await meliFetchJson(url, token);
  if (!result.ok) throw new Error(`MELI_QUESTIONS_FETCH_FAILED:${result.status}`);

  const questions = Array.isArray(result.data?.questions) ? result.data.questions : [];

  if (questions.length > 0) {
    await admin.from("ecommerce_logs").insert({
      empresa_id: job.empresa_id,
      ecommerce_id: job.ecommerce_id,
      provider: "meli",
      level: "info",
      event: "meli_questions_fetched",
      message: `${questions.length} perguntas não respondidas encontradas`,
      entity_type: "questions",
      context: sanitizeForLog({ count: questions.length, questions: questions.slice(0, 20) }),
    }).catch(() => {});
  }

  return { fetched: questions.length };
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

  // Claim pending jobs via RPC (FOR UPDATE SKIP LOCKED — no race condition)
  const { data: jobs, error: jobsErr } = await admin.rpc("ecommerce_import_jobs_claim", {
    p_provider: "meli",
    p_limit: 10,
    p_worker: "meli-worker",
  });

  if (jobsErr || !jobs?.length) {
    return json(200, { ok: true, processed: 0, hint: "No pending ML jobs" }, cors);
  }

  let processed = 0;
  let errors = 0;

  for (const job of jobs) {
    const jobId = String(job.id);
    // RPC already incremented attempts and set status=processing + locked_at
    const attempt = job.attempts ?? 1;

    // Create run record
    const { data: run } = await admin.from("ecommerce_job_runs").insert({
      empresa_id: job.empresa_id,
      job_id: jobId,
      provider: "meli",
      kind: job.kind,
      meta: job.payload,
    }).select("id").single();
    const runId = run?.id ? String(run.id) : null;

    try {
      const token = await ensureToken(admin, job.ecommerce_id);
      let result: Record<string, unknown> = {};

      switch (job.kind) {
        case "sync_stock":
          result = await processStockSync(admin, job as JobRow, token);
          break;
        case "sync_prices":
          result = await processPriceSync(admin, job as JobRow, token);
          break;
        case "import_orders":
          result = await processImportOrders(admin, job as JobRow, token);
          break;
        case "sync_item":
          result = await processSyncItem(admin, job as JobRow, token);
          break;
        case "sync_questions":
          result = await processSyncQuestions(admin, job as JobRow, token);
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
        provider: "meli",
        level: "info",
        event: `meli_worker_${job.kind}_done`,
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
        // Dead-letter
        await admin.from("ecommerce_jobs").update({
          status: "dead",
          locked_at: null,
          locked_by: null,
          last_error: msg,
        }).eq("id", jobId);

        await admin.from("ecommerce_job_dead_letters").insert({
          empresa_id: job.empresa_id,
          job_id: jobId,
          provider: "meli",
          kind: job.kind,
          dedupe_key: null,
          payload: job.payload ?? {},
          last_error: msg,
        }).catch(() => {});
      } else {
        // Retry with exponential backoff
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
        provider: "meli",
        level: "error",
        event: `meli_worker_${job.kind}_failed`,
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
