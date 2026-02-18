import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { resolveWooError } from "../_shared/woocommerceErrors.ts";
import { parsePositiveIntEnv, resolveWooInfraKeys, validateSchedulerKey } from "../_shared/woocommerceHardening.ts";

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const { workerKey, schedulerKey } = resolveWooInfraKeys((key) => Deno.env.get(key));
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!workerKey) missing.push("WOOCOMMERCE_WORKER_KEY");
  if (!schedulerKey) missing.push("WOOCOMMERCE_SCHEDULER_KEY");
  if (missing.length) return json(500, { ok: false, error: "ENV_NOT_CONFIGURED", missing }, cors);

  const headerKey = (req.headers.get("x-woocommerce-scheduler-key") ?? "").trim();
  const auth = validateSchedulerKey({
    providedKey: headerKey,
    expectedKey: schedulerKey,
    keysMatch: !!schedulerKey && !!headerKey && timingSafeEqual(schedulerKey, headerKey),
  });
  if (!auth.ok) {
    console.warn(JSON.stringify({ event: "scheduler_auth_failed", reason: auth.error }));
    return json(Number(auth.status ?? 403), { ok: false, error: String(auth.error ?? "SCHEDULER_FORBIDDEN") }, cors);
  }

  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const limit = Math.min(parsePositiveIntEnv(String(body?.limit ?? ""), 10), 10);
  const maxBatches = Math.min(parsePositiveIntEnv(String(body?.max_batches ?? ""), 25), 25);
  const storeId = body?.store_id ? String(body.store_id) : null;
  const startedAt = Date.now();

  const workerResp = await fetch(`${supabaseUrl}/functions/v1/woocommerce-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-woocommerce-worker-key": workerKey,
    },
    body: JSON.stringify({
      scheduler: true,
      limit,
      max_batches: maxBatches,
      store_id: storeId,
    }),
  });
  const workerData = await workerResp.json().catch(() => ({}));
  const durationMs = Date.now() - startedAt;

  const allStoreIds = new Set<string>();
  if (storeId) allStoreIds.add(storeId);
  for (const row of (Array.isArray((workerData as any)?.results) ? (workerData as any).results : [])) {
    const id = String((row as any)?.store_id ?? "").trim();
    if (id) allStoreIds.add(id);
  }

  if (allStoreIds.size > 0) {
    const { data: stores } = await svc
      .from("integrations_woocommerce_store")
      .select("id,empresa_id")
      .in("id", Array.from(allStoreIds));
    const storeRows = Array.isArray(stores) ? stores : [];

    if (!workerResp.ok) {
      const resolved = resolveWooError("CLAIM_FAILED");
      await Promise.all(storeRows.map((store: any) => svc.from("woocommerce_sync_log").insert({
        empresa_id: String(store.empresa_id),
        store_id: String(store.id),
        level: "error",
        message: "scheduler_tick_failed",
        meta: sanitizeForLog({
          code: "CLAIM_FAILED",
          hint: resolved.hint,
          duration_ms: durationMs,
          worker: workerData,
        }),
      }).catch(() => null)));
      return json(502, { ok: false, error: "WORKER_INVOKE_FAILED", details: workerData }, cors);
    }

    await Promise.all(storeRows.map((store: any) => svc.from("woocommerce_sync_log").insert({
      empresa_id: String(store.empresa_id),
      store_id: String(store.id),
      level: "info",
      message: "scheduler_tick",
      meta: sanitizeForLog({
        duration_ms: durationMs,
        processed_jobs: Number((workerData as any)?.processed_jobs ?? 0),
        limit,
        max_batches: maxBatches,
      }),
    }).catch(() => null)));
  }

  if (!workerResp.ok) return json(502, { ok: false, error: "WORKER_INVOKE_FAILED", details: workerData }, cors);

  return json(200, { ok: true, worker: workerData }, cors);
});
