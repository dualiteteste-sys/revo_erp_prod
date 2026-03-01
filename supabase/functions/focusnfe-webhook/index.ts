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
  const WEBHOOK_SECRET = (Deno.env.get("FOCUSNFE_WEBHOOK_SECRET") ?? "").trim();
  const WEBHOOK_SECRET_HML = (Deno.env.get("FOCUSNFE_WEBHOOK_SECRET_HML") ?? "").trim();
  const WEBHOOK_SECRET_PROD = (Deno.env.get("FOCUSNFE_WEBHOOK_SECRET_PROD") ?? "").trim();

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

function isAuthorized(req: Request): { ok: boolean; reason?: string } {
  const expected = getExpectedSecrets();
  if (expected.length === 0) return { ok: false, reason: "MISSING_FOCUSNFE_WEBHOOK_SECRET" };

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.trim()) return { ok: false, reason: "MISSING_AUTHORIZATION_HEADER" };

  const provided = extractBearerToken(authHeader);
  const ok = expected.some((s) => timingSafeEqual(provided, s));
  return ok ? { ok: true } : { ok: false, reason: "INVALID_AUTHORIZATION" };
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

/**
 * Process the Focus NFe webhook event inline:
 * - Look up the emissão by ref (emissao_id)
 * - Update status + DANFE/XML URLs
 */
async function processEvent(
  admin: ReturnType<typeof createClient>,
  meta: { eventType: string | null; focusRef: string | null },
  payload: any,
  requestId: string,
): Promise<{ processed: boolean; empresa_id: string | null }> {
  const ref = meta.focusRef;
  if (!ref) return { processed: false, empresa_id: null };

  // Try to find the emissão by id (ref = emissao_id in our system)
  const { data: emissao } = await admin
    .from("fiscal_nfe_emissoes")
    .select("id, empresa_id, status")
    .eq("id", ref)
    .maybeSingle();

  if (!emissao) return { processed: false, empresa_id: null };

  const empresaId = emissao.empresa_id;
  const focusStatus = payload?.status || meta.eventType || "";

  // Log the event
  await admin.from("fiscal_nfe_provider_logs").insert({
    empresa_id: empresaId,
    emissao_id: emissao.id,
    provider: "focusnfe",
    level: "info",
    message: `Webhook: ${focusStatus}`,
    payload: { event_type: meta.eventType, focus_status: focusStatus, request_id: requestId },
  });

  // Skip if already in terminal state
  if (["autorizada", "cancelada"].includes(emissao.status)) {
    return { processed: true, empresa_id: empresaId };
  }

  // Map Focus NFe status to our internal status
  if (focusStatus === "autorizado") {
    const chaveAcesso = payload?.chave_nfe || null;
    const numero = payload?.numero ? parseInt(payload.numero) : null;
    const danfeUrl = payload?.caminho_danfe || null;
    const xmlUrl = payload?.caminho_xml_nota_fiscal || null;

    await admin.from("fiscal_nfe_emissoes").update({
      status: "autorizada",
      chave_acesso: chaveAcesso,
      numero,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", emissao.id);

    // Update provider link with URLs
    await admin.from("fiscal_nfe_nfeio_emissoes").update({
      provider_status: "autorizado",
      response_payload: payload,
      danfe_url: danfeUrl,
      xml_url: xmlUrl,
      last_sync_at: new Date().toISOString(),
    }).eq("emissao_id", emissao.id);

    return { processed: true, empresa_id: empresaId };
  }

  if (focusStatus === "erro_autorizacao" || focusStatus === "rejeitado") {
    const errorMsg = payload?.mensagem || payload?.mensagem_sefaz || "";

    await admin.from("fiscal_nfe_emissoes").update({
      status: "rejeitada",
      last_error: errorMsg,
      updated_at: new Date().toISOString(),
    }).eq("id", emissao.id);

    return { processed: true, empresa_id: empresaId };
  }

  if (focusStatus === "cancelado") {
    await admin.from("fiscal_nfe_emissoes").update({
      status: "cancelada",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", emissao.id);

    return { processed: true, empresa_id: empresaId };
  }

  // Unknown status — just log, don't update
  return { processed: true, empresa_id: empresaId };
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  // Focus pode testar o endpoint no cadastro do webhook (GET/HEAD).
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET" || req.method === "HEAD") {
    return json(200, { ok: true, provider: "focusnfe" }, cors);
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const auth = isAuthorized(req);
  if (!auth.ok) {
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

  // Process the event inline — update emissão status + DANFE/XML URLs
  const { empresa_id } = await processEvent(admin, meta, payload, requestId);

  // Store raw event for audit trail
  await admin.from("fiscal_nfe_webhook_events").upsert(
    {
      empresa_id: empresa_id,
      provider: "focusnfe",
      event_type: meta.eventType,
      nfeio_id: meta.focusRef,
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
