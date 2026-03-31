/**
 * meli-scheduler — Periodically enqueues sync jobs for active ML connections
 *
 * Triggered by external cron (or Supabase scheduled function).
 * For each ML connection with auto_sync_enabled:
 *   - If sync_stock interval elapsed → enqueue STOCK_SYNC job
 *   - If sync_prices interval elapsed → enqueue PRICE_SYNC job
 *   - If import_orders interval elapsed → enqueue ORDER_IMPORT job
 *
 * Auth: Service key (verify_jwt = false)
 */

import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { trackRequestId } from "../_shared/request.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SCHEDULER_KEY = Deno.env.get("MELI_SCHEDULER_KEY") ?? "";

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  trackRequestId(req);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { ok: false, error: "MISSING_ENV" }, cors);
  }

  // Authenticate via scheduler key (prevents unauthorized invocations)
  if (SCHEDULER_KEY) {
    const provided = req.headers.get("x-meli-scheduler-key") ?? "";
    if (provided !== SCHEDULER_KEY) {
      return json(401, { ok: false, error: "UNAUTHORIZED" }, cors);
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Find all active ML connections with auto_sync_enabled
  const { data: connections, error: connErr } = await admin
    .from("ecommerces")
    .select("id,empresa_id,config,last_sync_at")
    .eq("provider", "meli")
    .eq("status", "connected")
    .limit(100);

  if (connErr || !connections?.length) {
    return json(200, { ok: true, scheduled: 0, hint: "No active ML connections" }, cors);
  }

  let scheduled = 0;
  const now = Date.now();

  for (const conn of connections) {
    const config = (conn.config && typeof conn.config === "object") ? conn.config as Record<string, unknown> : {};
    const autoSync = config.auto_sync_enabled === true;
    if (!autoSync) continue;

    const syncIntervalMin = Math.max(5, Math.min(1440, Number(config.sync_interval_minutes ?? 15)));
    const syncIntervalMs = syncIntervalMin * 60 * 1000;
    const lastSync = conn.last_sync_at ? new Date(conn.last_sync_at).getTime() : 0;
    const elapsed = now - lastSync;

    if (elapsed < syncIntervalMs) continue;

    const ecommerceId = String(conn.id);
    const empresaId = String(conn.empresa_id);
    const timestamp = new Date().toISOString().slice(0, 16); // minute-level dedup

    // Enqueue sync jobs based on config
    const jobsToCreate: { kind: string; enabled: boolean }[] = [
      { kind: "sync_stock", enabled: config.sync_stock === true },
      { kind: "sync_prices", enabled: config.sync_prices === true },
      { kind: "import_orders", enabled: config.import_orders !== false },
    ];

    for (const j of jobsToCreate) {
      if (!j.enabled) continue;
      const dedupeKey = `meli_scheduler:${j.kind}:${ecommerceId}:${timestamp}`;
      const { error: insertErr } = await admin.from("ecommerce_jobs").upsert(
        {
          empresa_id: empresaId,
          ecommerce_id: ecommerceId,
          provider: "meli",
          kind: j.kind,
          dedupe_key: dedupeKey,
          payload: { source: "scheduler", scheduled_at: new Date().toISOString() },
          status: "pending",
          attempts: 0,
          max_attempts: 3,
        },
        { onConflict: "provider,dedupe_key" },
      );
      if (!insertErr) scheduled++;
    }

    // Log
    await admin.from("ecommerce_logs").insert({
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "meli",
      level: "info",
      event: "meli_scheduler_tick",
      message: `Scheduler: enqueued jobs for ML connection`,
      entity_type: "scheduler",
      context: sanitizeForLog({
        elapsed_minutes: Math.round(elapsed / 60000),
        interval_minutes: syncIntervalMin,
        jobs: jobsToCreate.filter((j) => j.enabled).map((j) => j.kind),
      }),
    }).catch(() => {});
  }

  return json(200, { ok: true, scheduled, connections_checked: connections.length }, cors);
});
