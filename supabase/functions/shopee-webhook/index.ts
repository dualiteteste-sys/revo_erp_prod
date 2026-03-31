/**
 * shopee-webhook — Receives Shopee push notifications (public endpoint, no JWT)
 *
 * Shopee sends POST with:
 * { "shop_id": 123, "code": 3, "data": {...}, "timestamp": 1680000000 }
 *
 * Security: HMAC-SHA256 signature verification (blocking), rate limiting, dedup.
 * Push codes: 3=order_status, 4=order_trackingno, 5=shop_update, etc.
 *
 * Shopee requires: respond with 2xx + empty body.
 */

import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { trackRequestId } from "../_shared/request.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { verifyShopeeWebhookSignature } from "../_shared/shopeeHardening.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SHOPEE_PARTNER_KEY = Deno.env.get("SHOPEE_PARTNER_KEY") ?? "";

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_PER_MINUTE = 300;

/** Map Shopee push code to ecommerce_jobs kind */
function pushCodeToJobKind(code: number): string | null {
  if (code === 3 || code === 4) return "import_orders"; // order_status, order_trackingno
  return null;
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  trackRequestId(req);

  // Shopee requires 2xx + empty body for success
  const ok = () => new Response("", { status: 200, headers: cors });
  const err = (status: number) => new Response("", { status, headers: cors });

  if (req.method !== "POST") return err(405);
  if (!SUPABASE_URL || !SERVICE_KEY) return err(500);

  // -------------------------------------------------------------------------
  // 1. Read raw body (needed for signature verification)
  // -------------------------------------------------------------------------
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) return err(413);

  let rawBody: string;
  try {
    rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) return err(413);
  } catch {
    return err(400);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return err(400);
  }

  // -------------------------------------------------------------------------
  // 2. Parse notification fields
  // -------------------------------------------------------------------------
  const code = Number(body.code ?? 0);
  const shopId = body.shop_id != null ? String(body.shop_id) : null;
  const data = (body.data ?? {}) as Record<string, unknown>;
  const timestamp = body.timestamp != null ? Number(body.timestamp) : null;

  if (!shopId) return ok(); // Can't resolve without shop_id

  // -------------------------------------------------------------------------
  // 3. Signature verification (blocking)
  // -------------------------------------------------------------------------
  if (SHOPEE_PARTNER_KEY) {
    const signature = req.headers.get("authorization") ?? req.headers.get("x-shopee-signature") ?? "";
    if (!signature) return err(401);

    // Build callback URL for signature: full URL of this function
    const callbackUrl = new URL(req.url).toString().split("?")[0]; // base URL without query params
    const sigResult = await verifyShopeeWebhookSignature({
      partnerKey: SHOPEE_PARTNER_KEY,
      callbackUrl,
      rawBody,
      signature,
    });
    if (!sigResult.valid) return err(401);
  }

  // -------------------------------------------------------------------------
  // 4. Payload hash for audit
  // -------------------------------------------------------------------------
  const payloadHash = await sha256Hex(rawBody);

  // -------------------------------------------------------------------------
  // 5. Resolve empresa by shop_id
  // -------------------------------------------------------------------------
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let empresaId: string | null = null;
  let ecommerceId: string | null = null;

  // Try ecommerce_accounts first
  const { data: acct } = await admin
    .from("ecommerce_accounts")
    .select("empresa_id,ecommerce_id")
    .eq("external_account_id", shopId)
    .eq("provider", "shopee")
    .limit(1)
    .maybeSingle();

  if (acct?.empresa_id) {
    empresaId = String(acct.empresa_id);
    ecommerceId = acct.ecommerce_id ? String(acct.ecommerce_id) : null;
  } else {
    // Fallback: ecommerces table
    const { data: conn } = await admin
      .from("ecommerces")
      .select("id,empresa_id")
      .eq("provider", "shopee")
      .eq("external_account_id", shopId)
      .limit(1)
      .maybeSingle();
    if (conn?.empresa_id) {
      empresaId = String(conn.empresa_id);
      ecommerceId = String(conn.id);
    }
  }

  if (!empresaId || !ecommerceId) return ok(); // Unresolvable — 200 to prevent retries

  // -------------------------------------------------------------------------
  // 6. Rate limiting
  // -------------------------------------------------------------------------
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("ecommerce_logs")
    .select("*", { count: "exact", head: true })
    .eq("ecommerce_id", ecommerceId)
    .eq("event", "shopee_webhook_received")
    .gte("created_at", oneMinuteAgo);

  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) return err(429);

  // -------------------------------------------------------------------------
  // 7. Enqueue job
  // -------------------------------------------------------------------------
  const jobKind = pushCodeToJobKind(code);
  if (jobKind) {
    const orderSn = data.ordersn ? String(data.ordersn) : null;
    const stableDedupeKey = orderSn
      ? `shopee_webhook:${code}:${orderSn}`
      : `shopee_webhook:${code}:${shopId}:${timestamp ?? "now"}`;

    await admin
      .from("ecommerce_jobs")
      .upsert(
        {
          empresa_id: empresaId,
          ecommerce_id: ecommerceId,
          provider: "shopee",
          kind: jobKind,
          dedupe_key: stableDedupeKey,
          payload: sanitizeForLog({ code, data, shop_id: shopId }),
          status: "pending",
          attempts: 0,
          max_attempts: 3,
        },
        { onConflict: "provider,dedupe_key", ignoreDuplicates: true },
      )
      .catch(() => {});
  }

  // -------------------------------------------------------------------------
  // 8. Log
  // -------------------------------------------------------------------------
  await admin
    .from("ecommerce_logs")
    .insert({
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "shopee",
      level: "info",
      event: "shopee_webhook_received",
      message: `Webhook: code=${code} shop=${shopId}`,
      entity_type: "webhook",
      context: sanitizeForLog({
        code,
        shop_id: shopId,
        data,
        payload_hash: payloadHash,
      }),
    })
    .catch(() => {});

  return ok();
});
