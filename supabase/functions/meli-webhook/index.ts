/**
 * meli-webhook — Receives ML notifications (public endpoint, no JWT)
 *
 * ML sends POST notifications:
 * {
 *   "_id": "notification-uuid",
 *   "resource": "/orders/123456789",
 *   "topic": "orders_v2",
 *   "user_id": 12345678,
 *   "application_id": 67890,
 *   "sent": "2026-03-30T12:00:00.000Z",
 *   "attempts": 1,
 *   "received": "2026-03-30T12:00:00.000Z"
 * }
 *
 * Security: x-signature HMAC verification, payload hash, rate limiting, stable dedup.
 * Topics: orders_v2, items, questions, payments, messages, claims
 */

import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { trackRequestId } from "../_shared/request.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { verifyMeliSignature } from "../_shared/meliHardening.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MELI_CLIENT_SECRET = Deno.env.get("MELI_CLIENT_SECRET") ?? "";

const MAX_BODY_BYTES = 256 * 1024; // 256 KB
const RATE_LIMIT_PER_MINUTE = 300;

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Map ML topic to an ecommerce_jobs kind */
function topicToJobKind(topic: string): string | null {
  if (topic === "orders_v2" || topic === "orders") return "import_orders";
  if (topic === "items") return "sync_item";
  if (topic === "questions") return "sync_questions";
  return null;
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  trackRequestId(req);

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { ok: false, error: "MISSING_ENV" }, cors);
  }

  // -------------------------------------------------------------------------
  // 1. Payload size limit + raw body read (needed for hash + signature)
  // -------------------------------------------------------------------------
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "PAYLOAD_TOO_LARGE" }, cors);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return json(413, { ok: false, error: "PAYLOAD_TOO_LARGE" }, cors);
    }
  } catch {
    return json(400, { ok: false, error: "BODY_READ_ERROR" }, cors);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" }, cors);
  }

  // -------------------------------------------------------------------------
  // 2. Parse notification fields
  // -------------------------------------------------------------------------
  const topic = String(body.topic ?? "").trim();
  const resource = String(body.resource ?? "").trim();
  const userId = body.user_id != null ? String(body.user_id) : null;
  const applicationId = body.application_id != null ? String(body.application_id) : null;
  const notificationId = body._id != null ? String(body._id) : null;

  if (!topic) {
    return json(400, { ok: false, error: "MISSING_TOPIC" }, cors);
  }

  // -------------------------------------------------------------------------
  // 3. Payload hash for audit
  // -------------------------------------------------------------------------
  const payloadHash = await sha256Hex(rawBody);

  // -------------------------------------------------------------------------
  // 4. x-signature verification (blocking — rejects invalid signatures)
  // -------------------------------------------------------------------------
  const xSignatureHeader = req.headers.get("x-signature") ?? "";
  let signatureValid: boolean | null = null;

  if (MELI_CLIENT_SECRET && xSignatureHeader) {
    const sigResult = await verifyMeliSignature({
      clientSecret: MELI_CLIENT_SECRET,
      xSignatureHeader,
      resource: resource || "",
      userId: userId ?? "",
    });
    signatureValid = sigResult.valid;
    if (!sigResult.valid) {
      return json(401, { ok: false, error: "INVALID_SIGNATURE" }, cors);
    }
  } else if (MELI_CLIENT_SECRET && !xSignatureHeader) {
    return json(401, { ok: false, error: "MISSING_SIGNATURE" }, cors);
  }

  // -------------------------------------------------------------------------
  // 5. Resolve empresa by ML user_id
  // -------------------------------------------------------------------------
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let empresaId: string | null = null;
  let ecommerceId: string | null = null;

  if (userId) {
    // Try ecommerce_accounts first (multi-account support)
    const { data: acct } = await admin
      .from("ecommerce_accounts")
      .select("empresa_id,ecommerce_id")
      .eq("external_account_id", userId)
      .limit(1)
      .maybeSingle();

    if (acct?.empresa_id) {
      empresaId = String(acct.empresa_id);
      ecommerceId = acct.ecommerce_id ? String(acct.ecommerce_id) : null;
    } else {
      // Fallback: try ecommerces.external_account_id
      const { data: conn } = await admin
        .from("ecommerces")
        .select("id,empresa_id")
        .eq("provider", "meli")
        .eq("external_account_id", userId)
        .limit(1)
        .maybeSingle();
      if (conn?.empresa_id) {
        empresaId = String(conn.empresa_id);
        ecommerceId = String(conn.id);
      }
    }
  }

  if (!empresaId || !ecommerceId) {
    // Return 200 to prevent ML retry storms for unresolvable notifications
    return json(200, { ok: true, status: "ignored", reason: "UNRESOLVED_USER" }, cors);
  }

  // -------------------------------------------------------------------------
  // 6. Per-minute rate limiting
  // -------------------------------------------------------------------------
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("meli_webhook_events")
    .select("*", { count: "exact", head: true })
    .eq("ecommerce_id", ecommerceId)
    .gte("received_at", oneMinuteAgo);

  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return json(429, { ok: false, error: "RATE_LIMIT_EXCEEDED" }, cors);
  }

  // -------------------------------------------------------------------------
  // 7. Save webhook event (with dedup via unique index on notification_id)
  // -------------------------------------------------------------------------
  const { error: eventErr } = await admin.from("meli_webhook_events").insert({
    empresa_id: empresaId,
    ecommerce_id: ecommerceId,
    notification_id: notificationId,
    topic,
    resource: resource || null,
    user_id: userId,
    application_id: applicationId,
    process_status: "pending",
    payload_hash: payloadHash,
    signature_valid: signatureValid,
  });

  if (eventErr) {
    // Unique violation (23505) = duplicate notification — ML is retrying
    if (String(eventErr.code) === "23505") {
      return json(200, { ok: true, status: "deduplicated" }, cors);
    }
    // Other errors: continue (best-effort)
  }

  // -------------------------------------------------------------------------
  // 8. Enqueue job with stable dedupe key
  // -------------------------------------------------------------------------
  const jobKind = topicToJobKind(topic);
  if (jobKind) {
    const stableDedupeKey = notificationId
      ? `meli_webhook:${notificationId}`
      : `meli_webhook:${topic}:${resource || "none"}`;

    await admin
      .from("ecommerce_jobs")
      .upsert(
        {
          empresa_id: empresaId,
          ecommerce_id: ecommerceId,
          provider: "meli",
          kind: jobKind,
          dedupe_key: stableDedupeKey,
          payload: sanitizeForLog({ topic, resource, user_id: userId }),
          status: "pending",
          attempts: 0,
          max_attempts: 3,
        },
        { onConflict: "provider,dedupe_key", ignoreDuplicates: true },
      )
      .catch(() => {});
  }

  // -------------------------------------------------------------------------
  // 9. Log
  // -------------------------------------------------------------------------
  await admin
    .from("ecommerce_logs")
    .insert({
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "meli",
      level: "info",
      event: "meli_webhook_received",
      message: `Webhook: ${topic} — ${resource}`,
      entity_type: "webhook",
      context: sanitizeForLog({
        topic,
        resource,
        user_id: userId,
        application_id: applicationId,
        signature_valid: signatureValid,
        payload_hash: payloadHash,
      }),
    })
    .catch(() => {});

  return json(200, { ok: true, status: "queued" }, cors);
});
