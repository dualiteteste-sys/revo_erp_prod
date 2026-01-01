import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { hmacSha256Base64, hmacSha256Hex, sha256Hex, timingSafeEqual } from "../_shared/crypto.ts";
import { getRequestId } from "../_shared/request.ts";
import { sanitizeForLog, sanitizeHeaders } from "../_shared/sanitize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NFEIO_WEBHOOK_SECRET = Deno.env.get("NFEIO_WEBHOOK_SECRET") ?? "";

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function pickSignature(headers: Headers): string | null {
  const candidates = [
    "x-webhook-signature",
    "x-hub-signature-256",
    "x-hub-signature",
    "x-signature",
    "x-nfeio-signature",
    "x-nfeio-hmac",
  ];
  for (const name of candidates) {
    const val = headers.get(name);
    if (val) return val.trim();
  }
  return null;
}

function normalizeSig(sig: string): string {
  const s = sig.trim();
  return s.toLowerCase().startsWith("sha256=") ? s.slice(7).trim() : s;
}

function headersToJson(headers: Headers): Record<string, string> {
  return sanitizeHeaders(headers);
}

function extractMeta(payload: any): { eventType: string | null; nfeioId: string | null } {
  const eventType = (payload?.event ?? payload?.type ?? payload?.action ?? payload?.status ?? null) as string | null;
  const nfeioId =
    (payload?.data?.id ??
      payload?.nota_fiscal_id ??
      payload?.nfeio_id ??
      payload?.id ??
      payload?.data?.nota_fiscal_id ??
      null) as string | null;
  return {
    eventType: eventType ? String(eventType) : null,
    nfeioId: nfeioId ? String(nfeioId) : null,
  };
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const requestId = getRequestId(req);
  const signatureRaw = pickSignature(req.headers);
  const rawBody = await req.text();

  if (!NFEIO_WEBHOOK_SECRET) {
    return json(500, { ok: false, error: "MISSING_NFEIO_WEBHOOK_SECRET" }, cors);
  }
  if (!signatureRaw) {
    return json(401, { ok: false, error: "MISSING_SIGNATURE" }, cors);
  }

  const sig = normalizeSig(signatureRaw);
  const expectedHex = await hmacSha256Hex(NFEIO_WEBHOOK_SECRET, rawBody);
  const expectedB64 = await hmacSha256Base64(NFEIO_WEBHOOK_SECRET, rawBody);
  const ok = timingSafeEqual(sig, expectedHex) || timingSafeEqual(sig, expectedB64);
  if (!ok) {
    return json(401, { ok: false, error: "INVALID_SIGNATURE" }, cors);
  }

  let payload: any = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = { raw: rawBody };
  }

  const dedupeKey = await sha256Hex(rawBody || JSON.stringify(payload || {}));
  const meta = extractMeta(payload);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Tenta inferir empresa_id pelo nfeio_id (se existir)
  let empresaId: string | null = null;
  if (meta.nfeioId) {
    const { data: link } = await admin
      .from("fiscal_nfe_nfeio_emissoes")
      .select("empresa_id")
      .eq("nfeio_id", meta.nfeioId)
      .maybeSingle();
    if (link?.empresa_id) empresaId = link.empresa_id as string;
  }

  await admin.from("fiscal_nfe_webhook_events").upsert(
    {
      empresa_id: empresaId,
      provider: "nfeio",
      event_type: meta.eventType,
      nfeio_id: meta.nfeioId,
      dedupe_key: dedupeKey,
      request_id: requestId,
      headers: headersToJson(req.headers),
      payload: sanitizeForLog(payload),
      received_at: new Date().toISOString(),
    },
    { onConflict: "provider,dedupe_key" },
  );

  return json(200, { ok: true }, cors);
});
