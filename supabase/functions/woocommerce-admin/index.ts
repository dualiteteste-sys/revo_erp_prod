import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { aesGcmDecryptFromString, aesGcmEncryptToString } from "../_shared/crypto.ts";
import { getRequestId } from "../_shared/request.ts";
import { hasPermissionOrOwnerAdmin } from "../_shared/rbac.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";

type Action =
  | "stores.list"
  | "stores.create"
  | "stores.healthcheck"
  | "stores.webhooks.register"
  | "stores.product_map.build"
  | "stores.sync.stock"
  | "stores.sync.price"
  | "stores.reconcile.orders"
  | "stores.status";

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function normalizeStoreUrl(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("STORE_URL_REQUIRED");
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const u = new URL(withProto);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("STORE_URL_INVALID");
  u.hash = "";
  u.search = "";
  u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

function randomSecretBase64(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildWooApiUrl(params: {
  baseUrl: string;
  path: string;
  authMode: "basic_https" | "oauth1" | "querystring_fallback";
  consumerKey: string;
  consumerSecret: string;
  query?: Record<string, string>;
}): { url: string; headers: Record<string, string> } {
  const u = new URL(`${params.baseUrl}/wp-json/wc/v3/${params.path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(params.query ?? {})) u.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "UltriaERP/woocommerce-admin" };
  const ck = params.consumerKey.trim();
  const cs = params.consumerSecret.trim();
  if (params.authMode === "basic_https") {
    headers.Authorization = `Basic ${btoa(`${ck}:${cs}`)}`;
  } else if (params.authMode === "querystring_fallback") {
    u.searchParams.set("consumer_key", ck);
    u.searchParams.set("consumer_secret", cs);
  } else {
    headers.Authorization = `Basic ${btoa(`${ck}:${cs}`)}`;
  }
  return { url: u.toString(), headers };
}

async function wooFetchJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const resp = await fetch(url, init);
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function resolveEmpresaId(params: { baseUser: any; req: Request; }): Promise<string> {
  const header = (params.req.headers.get("x-empresa-id") ?? "").trim();
  if (header) return header;
  const { data, error } = await params.baseUser.rpc("active_empresa_get_for_current_user", {});
  if (error || !data) throw new Error("EMPRESA_ID_REQUIRED");
  return String(data).trim();
}

async function workerInvoke(params: { supabaseUrl: string; workerKey: string; storeId: string; limit?: number; }) {
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

  let empresaId = "";
  try {
    empresaId = await resolveEmpresaId({ baseUser, req });
  } catch {
    return json(400, { ok: false, error: "EMPRESA_ID_REQUIRED" }, cors);
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

  const body = (await req.json().catch(() => ({}))) as any;
  const action = String(body?.action ?? "").trim() as Action;
  if (!action) return json(400, { ok: false, error: "ACTION_REQUIRED" }, cors);

  try {
    if (action === "stores.list") {
      const { data, error } = await user.rpc("woocommerce_stores_list", {});
      if (error) throw error;
      return json(200, { ok: true, stores: data ?? [] }, cors);
    }

    if (action === "stores.create") {
      const baseUrl = normalizeStoreUrl(body?.base_url);
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
      .select("id,empresa_id,base_url,auth_mode,consumer_key_enc,consumer_secret_enc,webhook_secret_enc,status")
      .eq("id", storeId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (storeErr || !store?.id) return json(404, { ok: false, error: "STORE_NOT_FOUND" }, cors);

    const aad = `${empresaId}:${storeId}`;
    const consumerKey = await aesGcmDecryptFromString({ masterKey, ciphertext: String(store.consumer_key_enc), aad });
    const consumerSecret = await aesGcmDecryptFromString({ masterKey, ciphertext: String(store.consumer_secret_enc), aad });
    const baseUrl = normalizeStoreUrl(String(store.base_url));
    const authMode = (String(store.auth_mode ?? "basic_https") as "basic_https" | "oauth1" | "querystring_fallback") || "basic_https";

    if (action === "stores.healthcheck") {
      const { url, headers } = buildWooApiUrl({
        baseUrl,
        path: "products",
        authMode,
        consumerKey,
        consumerSecret,
        query: { per_page: "1", page: "1" },
      });
      const resp = await wooFetchJson(url, { headers });
      const ok = resp.ok;
      await svc.from("integrations_woocommerce_store").update({
        last_healthcheck_at: new Date().toISOString(),
        status: ok ? "active" : "error",
      }).eq("id", storeId).eq("empresa_id", empresaId);
      return json(200, { ok: true, status: ok ? "ok" : "error", http_status: resp.status, details: ok ? null : sanitizeForLog(resp.data) }, cors);
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

      // Best-effort: run worker once (if key configured) for faster feedback.
      let worker: any = null;
      if (workerKey) worker = await workerInvoke({ supabaseUrl, workerKey, storeId, limit: 10 });

      return json(200, { ok: true, enqueued_job_id: jobId, worker }, cors);
    }

    if (action === "stores.sync.stock" || action === "stores.sync.price") {
      const skus = Array.isArray(body?.skus) ? body.skus : [];
      const kind = action === "stores.sync.stock" ? "STOCK_SYNC" : "PRICE_SYNC";
      const dedupe = `${kind.toLowerCase()}:${new Date().toISOString().slice(0, 13)}`; // hourly bucket
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
      const [events, jobs, logs] = await Promise.all([
        svc.from("woocommerce_webhook_event").select("id,process_status,received_at,topic,woo_resource_id,last_error").eq("empresa_id", empresaId).eq("store_id", storeId).order("received_at", { ascending: false }).limit(20),
        svc.from("woocommerce_sync_job").select("id,type,status,attempts,next_run_at,last_error,created_at").eq("empresa_id", empresaId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(20),
        svc.from("woocommerce_sync_log").select("id,level,message,meta,created_at,job_id").eq("empresa_id", empresaId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(50),
      ]);
      return json(
        200,
        {
          ok: true,
          store: { id: storeId, base_url: baseUrl, auth_mode: authMode, status: store.status },
          webhook_events: events.data ?? [],
          jobs: jobs.data ?? [],
          logs: logs.data ?? [],
        },
        cors,
      );
    }

    return json(400, { ok: false, error: "ACTION_NOT_SUPPORTED" }, cors);
  } catch (e: any) {
    const message = e?.message || "UNEXPECTED_ERROR";
    return json(500, { ok: false, error: message }, cors);
  }
});
