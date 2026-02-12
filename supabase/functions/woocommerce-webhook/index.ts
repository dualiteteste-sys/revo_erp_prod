import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { aesGcmDecryptFromString, hmacSha256Base64, timingSafeEqual } from "../_shared/crypto.ts";
import { getRequestId } from "../_shared/request.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";

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

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const masterKey = Deno.env.get("INTEGRATIONS_MASTER_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "ENV_NOT_CONFIGURED" }, cors);
  if (!masterKey) return json(500, { ok: false, error: "MASTER_KEY_MISSING" }, cors);

  const storeId = parseStoreIdFromUrl(req.url);
  if (!storeId) return json(400, { ok: false, error: "STORE_ID_REQUIRED" }, cors);

  const requestId = getRequestId(req);
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-revo-request-id": requestId } },
  });

  const rawBody = await req.arrayBuffer();
  const payloadHash = await sha256HexBytes(rawBody);
  const rawText = new TextDecoder().decode(rawBody);

  let payload: any = {};
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = {};
  }

  const headers = readWebhookHeaders(req);
  const wooResourceId = Number(payload?.id ?? payload?.resource_id ?? 0) || 0;
  if (!wooResourceId) {
    return json(200, { ok: true, ignored: true }, cors);
  }

  const { data: store, error: storeErr } = await svc
    .from("integrations_woocommerce_store")
    .select("id,empresa_id,webhook_secret_enc,status,base_url")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr || !store?.empresa_id) return json(404, { ok: false, error: "STORE_NOT_FOUND" }, cors);
  if (String(store.status) !== "active") return json(200, { ok: true, ignored: true }, cors);

  const empresaId = String(store.empresa_id);

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
    if (!signatureValid) signatureError = "SIGNATURE_INVALID";
  } catch (e: any) {
    signatureValid = false;
    signatureError = e?.message || "SIGNATURE_CHECK_FAILED";
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
  };

  // Best-effort dedupe: if already received, no-op (still 2xx).
  const { error: insErr } = await svc.from("woocommerce_webhook_event").insert(insertPayload);
  if (insErr) {
    // Unique conflicts are expected on retries; avoid surfacing errors to Woo.
    return new Response(null, { status: 204, headers: cors });
  }

  if (signatureValid) {
    const dedupeKey = headers.deliveryId
      ? `delivery:${headers.deliveryId}`
      : `hash:${headers.topic}:${wooResourceId}:${payloadHash}`;

    await enqueueOrderJob({
      svc,
      empresaId,
      storeId,
      dedupeKey,
      payload: { order_id: wooResourceId, topic: headers.topic, payload_hash: payloadHash },
    });
  }

  // Webhook must respond fast; processing happens asynchronously.
  return new Response(null, { status: 204, headers: cors });
});

