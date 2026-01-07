import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sha256Hex, timingSafeEqual } from "../_shared/crypto.ts";
import { getRequestId } from "../_shared/request.ts";
import { sanitizeForLog, sanitizeHeaders } from "../_shared/sanitize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function headersToJson(headers: Headers): Record<string, string> {
  return sanitizeHeaders(headers);
}

function getExpectedSecrets(): string[] {
  // Lê os secrets em runtime (não em module-load) porque o Supabase Edge pode manter o isolate
  // "quente" por algum tempo; assim mudanças em secrets passam a valer imediatamente.
  const WEBHOOK_SECRET = (Deno.env.get("FOCUSNFE_WEBHOOK_SECRET") ?? "").trim();
  const WEBHOOK_SECRET_HML = (Deno.env.get("FOCUSNFE_WEBHOOK_SECRET_HML") ?? "").trim();
  const WEBHOOK_SECRET_PROD = (Deno.env.get("FOCUSNFE_WEBHOOK_SECRET_PROD") ?? "").trim();

  // Normaliza também segredos salvos com prefixo "Bearer " (erro comum ao configurar webhooks).
  const secrets = [WEBHOOK_SECRET, WEBHOOK_SECRET_HML, WEBHOOK_SECRET_PROD]
    .map((s) => extractBearerToken(s))
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(secrets));
}

function extractBearerToken(value: string): string {
  const v = value.trim();
  if (/^bearer\s+/i.test(v)) return v.replace(/^bearer\s+/i, "").trim();
  return v;
}

function isAuthorized(req: Request): { ok: boolean; reason?: string; provided?: string; expected?: string[] } {
  const expected = getExpectedSecrets();
  if (expected.length === 0) return { ok: false, reason: "MISSING_FOCUSNFE_WEBHOOK_SECRET", expected };

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.trim()) return { ok: false, reason: "MISSING_AUTHORIZATION_HEADER", expected };

  const provided = extractBearerToken(authHeader);
  const ok = expected.some((s) => timingSafeEqual(provided, s));
  return ok ? { ok: true } : { ok: false, reason: "INVALID_AUTHORIZATION", provided, expected };
}

function extractMeta(payload: any): { eventType: string | null; focusRef: string | null } {
  const eventType = (payload?.tipo_evento ?? payload?.event ?? payload?.type ?? payload?.status ?? null) as string | null;
  const focusRef =
    (payload?.ref ??
      payload?.referencia ??
      payload?.chave_nfe ??
      payload?.chave ??
      payload?.uuid ??
      payload?.id ??
      null) as string | null;
  return {
    eventType: eventType ? String(eventType) : null,
    focusRef: focusRef ? String(focusRef) : null,
  };
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  // Focus pode testar o endpoint no cadastro do webhook (GET/HEAD).
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET" || req.method === "HEAD") {
    const url = new URL(req.url);
    if (url.searchParams.get("debug") === "1") {
      const generic = (Deno.env.get("FOCUSNFE_WEBHOOK_SECRET") ?? "").trim();
      const hml = (Deno.env.get("FOCUSNFE_WEBHOOK_SECRET_HML") ?? "").trim();
      const prod = (Deno.env.get("FOCUSNFE_WEBHOOK_SECRET_PROD") ?? "").trim();
      const hash = async (v: string) => (v ? await sha256Hex(v) : null);
      return json(
        200,
        {
          ok: true,
          provider: "focusnfe",
          debug: {
            has: { generic: Boolean(generic), hml: Boolean(hml), prod: Boolean(prod) },
            sha256: { generic: await hash(generic), hml: await hash(hml), prod: await hash(prod) },
          },
        },
        cors,
      );
    }
    return json(200, { ok: true, provider: "focusnfe" }, cors);
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const auth = isAuthorized(req);
  if (!auth.ok) {
    const url = new URL(req.url);
    if (url.searchParams.get("debug") === "1") {
      const providedSha = auth.provided ? await sha256Hex(auth.provided) : null;
      const expectedSha = auth.expected ? await Promise.all(auth.expected.map((s) => sha256Hex(s))) : [];
      return json(
        401,
        {
          ok: false,
          error: auth.reason ?? "UNAUTHORIZED",
          debug: {
            providedSha,
            expectedSha,
            authHeaderPresent: Boolean((req.headers.get("authorization") ?? "").trim()),
            authHeader: req.headers.get("authorization") ?? null,
            provided: auth.provided ?? null,
          },
        },
        cors,
      );
    }
    return json(401, { ok: false, error: auth.reason ?? "UNAUTHORIZED" }, cors);
  }

  const requestId = getRequestId(req);
  const rawBody = await req.text();

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

  // Quando a integração estiver completa, vamos inferir empresa_id por "ref" (vínculo provider↔emissão).
  // Por enquanto, armazenamos sem empresa_id e processamos depois via worker/reprocessamento.
  await admin.from("fiscal_nfe_webhook_events").upsert(
    {
      empresa_id: null,
      provider: "focusnfe",
      event_type: meta.eventType,
      nfeio_id: meta.focusRef, // coluna legado; usamos como "provider_ref"
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
