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

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
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

function normalizeStatus(raw: unknown): string {
  const status = String(raw ?? "").trim().toLowerCase();
  if (!status) return "processando";
  if (status.includes("autoriz")) return "autorizada";
  if (status.includes("cancel")) return "cancelada";
  if (status.includes("rejeit")) return "rejeitada";
  if (status.includes("erro") || status.includes("deneg")) return "erro";
  if (status.includes("fila") || status.includes("enfileir")) return "enfileirada";
  if (status.includes("process") || status.includes("autorizacao")) return "processando";
  return "processando";
}

function extractErrorMessage(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload?.mensagem_sefaz,
    payload?.motivo,
    payload?.mensagem,
    payload?.erro,
    payload?.error,
    payload?.detail,
  ];

  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text) return text.slice(0, 900);
  }
  return null;
}

function extractMeta(payload: Record<string, unknown>): { eventType: string | null; focusRef: string | null; status: string | null } {
  const eventType = (payload?.tipo_evento ?? payload?.event ?? payload?.type ?? payload?.status ?? null) as string | null;
  const focusRef =
    (payload?.ref ??
      payload?.referencia ??
      payload?.chave_nfe ??
      payload?.chave ??
      payload?.uuid ??
      payload?.id ??
      null) as string | null;
  const status = (payload?.status ?? payload?.situacao ?? null) as string | null;
  return {
    eventType: eventType ? String(eventType) : null,
    focusRef: focusRef ? String(focusRef) : null,
    status: status ? String(status) : null,
  };
}

async function resolveEmissaoByRef(admin: ReturnType<typeof createClient>, focusRef: string) {
  const ref = String(focusRef ?? "").trim();
  if (!ref) return null;
  const refNoHyphen = ref.replace(/-/g, "");

  const candidates = [ref, refNoHyphen].filter(Boolean);
  for (const value of candidates) {
    const byProviderRef = await admin
      .from("fiscal_nfe_emissoes")
      .select("id,empresa_id,payload,numero,serie,chave_acesso")
      .eq("provider_ref", value)
      .maybeSingle();
    if (byProviderRef.data) return byProviderRef.data;

    const byId = await admin
      .from("fiscal_nfe_emissoes")
      .select("id,empresa_id,payload,numero,serie,chave_acesso")
      .eq("id", value)
      .maybeSingle();
    if (byId.data) return byId.data;
  }
  return null;
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);

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

  let payload: Record<string, unknown> = {};
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

  const emissao = meta.focusRef ? await resolveEmissaoByRef(admin, meta.focusRef) : null;
  const empresaId = emissao?.empresa_id ?? null;
  const mappedStatus = normalizeStatus(meta.status ?? meta.eventType ?? null);
  const lastError = extractErrorMessage(payload);

  await admin.from("fiscal_nfe_webhook_events").upsert(
    {
      empresa_id: empresaId,
      provider: "focusnfe",
      event_type: meta.eventType,
      nfeio_id: meta.focusRef,
      dedupe_key: dedupeKey,
      request_id: requestId,
      headers: headersToJson(req.headers),
      payload: sanitizeForLog(payload),
      received_at: new Date().toISOString(),
      processed_at: empresaId ? new Date().toISOString() : null,
      process_attempts: empresaId ? 1 : 0,
      last_error: empresaId ? null : "Emissão não encontrada para a referência do webhook.",
    },
    { onConflict: "provider,dedupe_key" },
  );

  if (!emissao || !empresaId) {
    return json(200, { ok: true, linked: false, request_id: requestId }, cors);
  }

  const nextPayload = {
    ...(typeof emissao.payload === "object" && emissao.payload ? emissao.payload : {}),
    focus_last_webhook: {
      request_id: requestId,
      received_at: new Date().toISOString(),
      event_type: meta.eventType,
      status: meta.status,
      payload: sanitizeForLog(payload),
    },
  };

  await admin
    .from("fiscal_nfe_emissoes")
    .update({
      status: mappedStatus,
      provider_slug: "FOCUSNFE",
      provider_ref: meta.focusRef ?? emissao.id,
      numero: Number(payload?.numero ?? emissao.numero ?? 0) || null,
      serie: Number(payload?.serie ?? emissao.serie ?? 0) || null,
      chave_acesso: String(payload?.chave_acesso ?? payload?.chave ?? emissao.chave_acesso ?? "") || null,
      last_error: mappedStatus === "autorizada" ? null : lastError,
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", emissao.id)
    .eq("empresa_id", empresaId);

  await admin.from("fiscal_nfe_nfeio_emissoes").upsert({
    empresa_id: empresaId,
    emissao_id: emissao.id,
    ambiente: "homologacao",
    nfeio_id: meta.focusRef ?? emissao.id,
    provider_status: meta.status ?? meta.eventType ?? null,
    response_payload: sanitizeForLog(payload),
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "emissao_id" });

  await admin.from("fiscal_nfe_provider_logs").insert({
    empresa_id: empresaId,
    emissao_id: emissao.id,
    provider: "focusnfe",
    level: mappedStatus === "erro" || mappedStatus === "rejeitada" ? "error" : "info",
    message: `Webhook Focus recebido: ${meta.eventType ?? meta.status ?? "evento"}`,
    payload: sanitizeForLog(payload),
    request_id: requestId,
  });

  return json(200, { ok: true, linked: true, emissao_id: emissao.id, status: mappedStatus, request_id: requestId }, cors);
});
