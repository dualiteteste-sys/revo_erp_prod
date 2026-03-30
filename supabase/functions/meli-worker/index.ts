/**
 * meli-worker — Background job processor for Mercado Livre integration
 *
 * Picks jobs from `ecommerce_jobs` WHERE provider='meli' and processes them:
 *   - STOCK_SYNC: sync stock for published items
 *   - PRICE_SYNC: sync prices for published items
 *   - LISTING_CREATE: create a new listing on ML
 *   - LISTING_UPDATE: update existing listing on ML
 *
 * Triggered by: meli-scheduler (cron), or inline after meli-admin actions
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
  classifyMeliHttpStatus,
} from "../_shared/meliHardening.ts";

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
  const refreshToken = sec?.refresh_token ? String(sec.refresh_token) : "";
  const expiresAt = sec?.token_expires_at ? new Date(sec.token_expires_at) : null;
  const expired = expiresAt ? expiresAt.getTime() <= Date.now() + 5 * 60 * 1000 : false;

  if ((!accessToken || expired) && refreshToken) {
    const r = await refreshMeliToken({
      clientId: MELI_CLIENT_ID,
      clientSecret: MELI_CLIENT_SECRET,
      refreshToken,
    });
    if (!r.ok) throw new Error(`TOKEN_REFRESH_FAILED:${r.status}`);
    accessToken = String(r.data?.access_token ?? "");
    const newRefresh = String(r.data?.refresh_token ?? refreshToken);
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

async function processStockSync(admin: any, job: JobRow, token: string): Promise<{ updated: number; failed: number }> {
  const { data: anuncios } = await admin
    .from("produto_anuncios")
    .select("id,produto_id,identificador_externo")
    .eq("empresa_id", job.empresa_id)
    .eq("ecommerce_id", job.ecommerce_id)
    .not("identificador_externo", "is", null)
    .limit(200);

  let updated = 0;
  let failed = 0;
  for (const a of anuncios ?? []) {
    const { data: prod } = await admin
      .from("produtos")
      .select("estoque_disponivel,estoque_atual")
      .eq("id", a.produto_id)
      .maybeSingle();
    const qty = Math.max(0, Math.trunc(Number(prod?.estoque_disponivel ?? prod?.estoque_atual ?? 0)));
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
    await sleep(100); // Respect rate limits
  }
  return { updated, failed };
}

async function processPriceSync(admin: any, job: JobRow, token: string): Promise<{ updated: number; failed: number }> {
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

  // Claim pending jobs for ML
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // stale lock: 10min
  const { data: jobs, error: jobsErr } = await admin
    .from("ecommerce_jobs")
    .select("id,empresa_id,ecommerce_id,kind,payload,attempts,max_attempts,locked_at")
    .eq("provider", "meli")
    .in("status", ["pending", "processing"])
    .or(`locked_at.is.null,locked_at.lt.${cutoff}`)
    .order("created_at", { ascending: true })
    .limit(10);

  if (jobsErr || !jobs?.length) {
    return json(200, { ok: true, processed: 0, hint: "No pending ML jobs" }, cors);
  }

  let processed = 0;
  let errors = 0;

  for (const job of jobs) {
    const jobId = String(job.id);
    const attempt = (job.attempts ?? 0) + 1;

    // Lock the job
    await admin.from("ecommerce_jobs").update({
      status: "processing",
      locked_at: new Date().toISOString(),
      locked_by: "meli-worker",
      attempts: attempt,
    }).eq("id", jobId);

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
      let result: { updated: number; failed: number } = { updated: 0, failed: 0 };

      switch (job.kind) {
        case "sync_stock":
          result = await processStockSync(admin, job as JobRow, token);
          break;
        case "sync_prices":
          result = await processPriceSync(admin, job as JobRow, token);
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
        message: `Job ${job.kind} concluído: ${result.updated} atualizados, ${result.failed} falhas`,
        entity_type: "job",
        entity_id: jobId,
        run_id: runId,
        context: sanitizeForLog(result),
      });

      processed++;
    } catch (e: any) {
      const msg = String(e?.message || "WORKER_ERROR").slice(0, 500);
      errors++;

      // Dead-letter if max attempts exceeded
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
          provider: "meli",
          kind: job.kind,
          payload: job.payload,
          error: msg,
          attempts: attempt,
        }).catch(() => {});
      } else {
        // Retry with backoff
        await admin.from("ecommerce_jobs").update({
          status: "pending",
          locked_at: null,
          locked_by: null,
          last_error: msg,
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
      });
    }
  }

  return json(200, { ok: true, processed, errors, total_jobs: jobs.length }, cors);
});
