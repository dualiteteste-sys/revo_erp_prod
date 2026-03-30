/**
 * meli-webhook — Receives ML notifications (public endpoint, no JWT)
 *
 * ML sends POST notifications:
 * {
 *   "resource": "/orders/123456789",
 *   "topic": "orders_v2",
 *   "user_id": 12345678,
 *   "application_id": 67890,
 *   "sent": "2026-03-30T12:00:00.000Z",
 *   "attempts": 1,
 *   "received": "2026-03-30T12:00:00.000Z"
 * }
 *
 * Topics: orders_v2, items, questions, payments, messages, claims
 */

import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { trackRequestId } from "../_shared/request.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" }, cors);
  }

  const topic = String(body.topic ?? "").trim();
  const resource = String(body.resource ?? "").trim();
  const userId = body.user_id != null ? String(body.user_id) : null;
  const applicationId = body.application_id != null ? String(body.application_id) : null;
  const notificationId = body._id != null ? String(body._id) : null;

  if (!topic) {
    return json(400, { ok: false, error: "MISSING_TOPIC" }, cors);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve empresa by ML user_id → ecommerce_accounts.external_account_id
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
    // Log unresolved notification (best-effort) and return 200 to ML
    // ML retries if non-200 is returned, so we accept even if we can't resolve
    return json(200, { ok: true, status: "ignored", reason: "UNRESOLVED_USER" }, cors);
  }

  // Save webhook event
  await admin.from("meli_webhook_events").insert({
    empresa_id: empresaId,
    ecommerce_id: ecommerceId,
    notification_id: notificationId,
    topic,
    resource: resource || null,
    user_id: userId,
    application_id: applicationId,
    process_status: "pending",
  }).catch(() => {});

  // Enqueue job if topic is actionable
  const jobKind = topicToJobKind(topic);
  if (jobKind) {
    const dedupeKey = `meli_webhook:${topic}:${resource || "none"}:${Date.now().toString(36)}`;
    await admin.from("ecommerce_jobs").insert({
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "meli",
      kind: jobKind,
      dedupe_key: dedupeKey,
      payload: sanitizeForLog({ topic, resource, user_id: userId }),
      status: "pending",
      attempts: 0,
      max_attempts: 3,
    }).catch(() => {});
  }

  // Log
  await admin.from("ecommerce_logs").insert({
    empresa_id: empresaId,
    ecommerce_id: ecommerceId,
    provider: "meli",
    level: "info",
    event: "meli_webhook_received",
    message: `Webhook: ${topic} — ${resource}`,
    entity_type: "webhook",
    context: sanitizeForLog({ topic, resource, user_id: userId, application_id: applicationId }),
  }).catch(() => {});

  return json(200, { ok: true, status: "queued" }, cors);
});
