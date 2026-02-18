import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { aesGcmDecryptFromString, hmacSha256Base64, timingSafeEqual } from "../_shared/crypto.ts";
import { getRequestId } from "../_shared/request.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { detectWooErrorCode, resolveWooError } from "../_shared/woocommerceErrors.ts";
import { dedupeKeyForWebhook, dropReconcileDedupeKey, parsePositiveIntEnv, resolveIntegrationsMasterKey } from "../_shared/woocommerceHardening.ts";

type WebhookHeaders = {
  topic: string;
  deliveryId: string | null;
  signature: string | null;
};

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function parseStoreIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    return parts[parts.length - 1] || null;
  } catch {
    return null;
  }
}

function readWebhookHeaders(req: Request): WebhookHeaders {
  const topicHeader = (req.headers.get("x-wc-webhook-topic") ?? "").trim();
  const resource = (req.headers.get("x-wc-webhook-resource") ?? "").trim();
  const event = (req.headers.get("x-wc-webhook-event") ?? "").trim();
  const topic = topicHeader || (resource && event ? `${resource}.${event}` : "unknown.unknown");
  const deliveryId = (req.headers.get("x-wc-webhook-delivery-id") ?? "").trim() || null;
  const signature = (req.headers.get("x-wc-webhook-signature") ?? "").trim() || null;
  return { topic, deliveryId, signature };
}

async function sha256HexBytes(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function enqueueOrderJob(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
}) {
  const { svc, empresaId, storeId } = params;
  const dedupeKey = params.dedupeKey.slice(0, 200);
  const payload = params.payload ?? {};

  // Dedupe by store/type/key. This prevents noisy retries from flooding the queue.
  await svc.from("woocommerce_sync_job").upsert(
    {
      empresa_id: empresaId,
      store_id: storeId,
      type: "ORDER_RECONCILE",
      dedupe_key: dedupeKey,
      payload,
      status: "queued",
      next_run_at: new Date().toISOString(),
    },
    { onConflict: "store_id,type,dedupe_key" },
  );
}

async function enqueueDroppedReconcileJob(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  reason: string;
  topic: string;
  payloadHash: string;
}) {
  const dedupeKey = dropReconcileDedupeKey(Date.now(), 5);
  await params.svc.from("woocommerce_sync_job").upsert({
    empresa_id: params.empresaId,
    store_id: params.storeId,
    type: "ORDER_RECONCILE",
    dedupe_key: dedupeKey,
    payload: {
      reconcile_recent: true,
      reason: params.reason,
      topic: params.topic,
      payload_hash: params.payloadHash,
      window_minutes: 5,
    },
    status: "queued",
    next_run_at: new Date().toISOString(),
  }, { onConflict: "store_id,type,dedupe_key" });
}

async function enforceWebhookRateLimit(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  limitPerMinute: number;
}): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await params.svc
    .from("woocommerce_webhook_event")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", params.empresaId)
    .eq("store_id", params.storeId)
    .gte("received_at", since);
  return Number(count ?? 0) <= params.limitPerMinute;
}

async function logWebhookError(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  code: string;
  context: string;
  meta?: Record<string, unknown>;
}) {
  const resolved = resolveWooError(params.code);
  await params.svc.from("woocommerce_sync_log").insert({
    empresa_id: params.empresaId,
    store_id: params.storeId,
    level: resolved.severity,
    message: params.context,
    meta: sanitizeForLog({
      code: resolved.code,
      hint: resolved.hint,
      ...params.meta,
    }),
  });
}

async function logPayloadLimitExceeded(params: {
  svc: any;
  empresaId: string;
  storeId: string;
  limitBytes: number;
  receivedBytes: number;
  requestId: string;
  topic: string;
  payloadHash: string;
}) {
  await logWebhookError({
    svc: params.svc,
    empresaId: params.empresaId,
    storeId: params.storeId,
    code: "WEBHOOK_PAYLOAD_TOO_LARGE",
    context: "webhook_payload_too_large",
    meta: {
      request_id: params.requestId,
      limit_bytes: params.limitBytes,
      received_bytes: params.receivedBytes,
    },
  });
  await params.svc.from("woocommerce_webhook_event").insert({
    empresa_id: params.empresaId,
    store_id: params.storeId,
    topic: params.topic || "unknown.unknown",
    woo_resource_id: 0,
    delivery_id: null,
    payload_hash: params.payloadHash,
    signature_valid: false,
    payload: { dropped: true, reason: "WEBHOOK_PAYLOAD_TOO_LARGE" },
    process_status: "dropped",
    last_error: "WEBHOOK_PAYLOAD_TOO_LARGE",
    error_code: "WEBHOOK_PAYLOAD_TOO_LARGE",
  }).catch(() => null);
  await enqueueDroppedReconcileJob({
    svc: params.svc,
    empresaId: params.empresaId,
    storeId: params.storeId,
    reason: "WEBHOOK_PAYLOAD_TOO_LARGE",
    topic: params.topic,
    payloadHash: params.payloadHash,
  }).catch(() => null);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const masterKey = resolveIntegrationsMasterKey((key) => Deno.env.get(key));
  const webhookMaxBytes = parsePositiveIntEnv(Deno.env.get("WOOCOMMERCE_WEBHOOK_MAX_BYTES"), 262_144);
  const webhookRateLimitPerMinute = parsePositiveIntEnv(Deno.env.get("WOOCOMMERCE_WEBHOOK_RATE_LIMIT_PER_MINUTE"), 120);
  const webhookRetentionDays = parsePositiveIntEnv(Deno.env.get("WOOCOMMERCE_WEBHOOK_RETENTION_DAYS"), 14);
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "ENV_NOT_CONFIGURED" }, cors);
  if (!masterKey) return json(500, { ok: false, error: "MASTER_KEY_MISSING" }, cors);

  const storeId = parseStoreIdFromUrl(req.url);
  if (!storeId) return json(400, { ok: false, error: "STORE_ID_REQUIRED" }, cors);

  const requestId = getRequestId(req);
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-revo-request-id": requestId } },
  });

  const headers = readWebhookHeaders(req);

  const { data: store, error: storeErr } = await svc
    .from("integrations_woocommerce_store")
    .select("id,empresa_id,webhook_secret_enc,status,base_url")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr || !store?.empresa_id) return json(404, { ok: false, error: "STORE_NOT_FOUND" }, cors);
  if (String(store.status) !== "active") return json(200, { ok: true, ignored: true }, cors);

  const empresaId = String(store.empresa_id);
  const contentLengthRaw = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLengthRaw) && contentLengthRaw > webhookMaxBytes) {
    await logPayloadLimitExceeded({
      svc,
      empresaId,
      storeId,
      requestId,
      limitBytes: webhookMaxBytes,
      receivedBytes: contentLengthRaw,
      topic: headers.topic,
      payloadHash: `drop:content-length:${requestId}`,
    });
    return new Response(null, { status: 204, headers: cors });
  }

  const rawBody = await req.arrayBuffer();
  if (rawBody.byteLength > webhookMaxBytes) {
    await logPayloadLimitExceeded({
      svc,
      empresaId,
      storeId,
      requestId,
      limitBytes: webhookMaxBytes,
      receivedBytes: rawBody.byteLength,
      topic: headers.topic,
      payloadHash: `drop:raw-size:${requestId}`,
    });
    return new Response(null, { status: 204, headers: cors });
  }
  const payloadHash = await sha256HexBytes(rawBody);
  const rawText = new TextDecoder().decode(rawBody);

  let payload: any = {};
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = {};
  }

  const wooResourceId = Number(payload?.id ?? payload?.resource_id ?? 0) || 0;
  if (!wooResourceId) {
    return json(200, { ok: true, ignored: true }, cors);
  }
  const underRate = await enforceWebhookRateLimit({
    svc,
    empresaId,
    storeId,
    limitPerMinute: webhookRateLimitPerMinute,
  });
  if (!underRate) {
    await logWebhookError({
      svc,
      empresaId,
      storeId,
      code: "WEBHOOK_RATE_LIMITED",
      context: "webhook_rate_limited",
      meta: { request_id: requestId, limit_per_minute: webhookRateLimitPerMinute },
    });
    await svc.from("woocommerce_webhook_event").insert({
      empresa_id: empresaId,
      store_id: storeId,
      topic: headers.topic,
      woo_resource_id: wooResourceId,
      delivery_id: headers.deliveryId,
      payload_hash: payloadHash,
      signature_valid: false,
      payload: { dropped: true, reason: "WEBHOOK_RATE_LIMITED" },
      process_status: "dropped",
      last_error: "WEBHOOK_RATE_LIMITED",
      error_code: "WEBHOOK_RATE_LIMITED",
    }).catch(() => null);
    await enqueueDroppedReconcileJob({
      svc,
      empresaId,
      storeId,
      reason: "WEBHOOK_RATE_LIMITED",
      topic: headers.topic,
      payloadHash,
    }).catch(() => null);
    return new Response(null, { status: 204, headers: cors });
  }

  let signatureValid = false;
  let signatureError: string | null = null;
  try {
    const webhookSecretEnc = String(store.webhook_secret_enc ?? "").trim();
    if (!webhookSecretEnc) throw new Error("WEBHOOK_SECRET_NOT_CONFIGURED");
    const webhookSecret = await aesGcmDecryptFromString({
      masterKey,
      ciphertext: webhookSecretEnc,
      aad: `${empresaId}:${storeId}`,
    });
    const computed = await hmacSha256Base64(webhookSecret, rawText);
    signatureValid = !!headers.signature && timingSafeEqual(computed, headers.signature);
    if (!signatureValid) signatureError = "WEBHOOK_SIGNATURE_INVALID";
  } catch (e: any) {
    signatureValid = false;
    signatureError = e?.message || "WEBHOOK_SIGNATURE_CHECK_FAILED";
  }

  const insertPayload = {
    empresa_id: empresaId,
    store_id: storeId,
    topic: headers.topic,
    woo_resource_id: wooResourceId,
    delivery_id: headers.deliveryId,
    payload_hash: payloadHash,
    signature_valid: signatureValid,
    payload: sanitizeForLog(payload ?? {}),
    process_status: signatureValid ? "queued" : "error",
    last_error: signatureValid ? null : signatureError,
    error_code: signatureValid ? null : detectWooErrorCode(String(signatureError ?? "")),
  };

  // Best-effort dedupe: if already received, no-op (still 2xx).
  const { error: insErr } = await svc.from("woocommerce_webhook_event").insert(insertPayload);
  if (insErr) {
    // Unique conflicts are expected on retries; avoid surfacing errors to Woo.
    return new Response(null, { status: 204, headers: cors });
  }

  if (signatureValid) {
    const dedupeKey = dedupeKeyForWebhook({
      deliveryId: headers.deliveryId,
      topic: headers.topic,
      wooResourceId,
      payloadHash,
    });

    await enqueueOrderJob({
      svc,
      empresaId,
      storeId,
      dedupeKey,
      payload: { order_id: wooResourceId, topic: headers.topic, payload_hash: payloadHash },
    });
  } else {
    const code = detectWooErrorCode(String(signatureError ?? ""));
    await logWebhookError({
      svc,
      empresaId,
      storeId,
      code,
      context: "webhook_signature_invalid",
      meta: {
        topic: headers.topic,
        delivery_id: headers.deliveryId,
        payload_hash: payloadHash,
        request_id: requestId,
      },
    });
  }

  // Best-effort retention cleanup. Keep only recent webhook payloads.
  await svc.rpc("woocommerce_webhook_event_cleanup", {
    p_store_id: storeId,
    p_keep_days: webhookRetentionDays,
    p_limit: 50,
  }).catch(() => null);

  // Webhook must respond fast; processing happens asynchronously.
  return new Response(null, { status: 204, headers: cors });
});
