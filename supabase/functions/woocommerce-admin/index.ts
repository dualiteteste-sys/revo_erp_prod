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
  | "stores.jobs.requeue";

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
  if (!masterKey) return json(500, { ok: false, error: "MASTER_KEY_MISSING" }, cors);

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
      const { data, error } = await user.rpc("woocommerce_stores_list", {});
      if (error) throw error;
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

    const aad = `${empresaId}:${storeId}`;
    const consumerKey = await aesGcmDecryptFromString({ masterKey, ciphertext: String(store.consumer_key_enc), aad });
    const consumerSecret = await aesGcmDecryptFromString({ masterKey, ciphertext: String(store.consumer_secret_enc), aad });
    const baseUrl = normalizeWooStoreUrl(String(store.base_url));
    const authMode = (String(store.auth_mode ?? "basic_https") as "basic_https" | "oauth1" | "querystring_fallback") || "basic_https";

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

    if (action === "stores.status") {
      const [events, jobs, logs, queued, running, errored, dead, mapQuality, orderTotal, orderLatest] = await Promise.all([
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
