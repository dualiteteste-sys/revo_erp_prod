import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { hasPermissionOrOwnerAdmin } from "../_shared/rbac.ts";
import { nfeioBaseUrl, nfeioFetchJson, type NfeioEnvironment } from "../_shared/nfeio.ts";
import { getRequestId } from "../_shared/request.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NFEIO_API_KEY = Deno.env.get("NFEIO_API_KEY") ?? "";

type Body = { emissao_id?: string; correction_text?: string; provider_payload?: any };

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const requestId = getRequestId(req);
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);
  if (!NFEIO_API_KEY) return json(500, { ok: false, error: "MISSING_NFEIO_API_KEY" }, cors);

  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: me } = await user.auth.getUser();
  const userId = me?.user?.id;
  if (!userId) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const body = (await req.json().catch(() => ({}))) as Body;
  const emissaoId = (body.emissao_id ?? "").trim();
  if (!emissaoId) return json(400, { ok: false, error: "MISSING_EMISSAO_ID" }, cors);

  const { data: emissao } = await user
    .from("fiscal_nfe_emissoes")
    .select("id,empresa_id,ambiente,status")
    .eq("id", emissaoId)
    .maybeSingle();
  if (!emissao?.id) return json(404, { ok: false, error: "EMISSAO_NOT_FOUND" }, cors);

  const empresaId = emissao.empresa_id as string;
  const ambiente = (emissao.ambiente ?? "homologacao") as NfeioEnvironment;

  const allowed = await hasPermissionOrOwnerAdmin(user, admin, userId, empresaId, "fiscal", "nfe_manage");
  if (!allowed) return json(403, { ok: false, error: "FORBIDDEN_RBAC" }, cors);

  const { data: cfg } = await admin
    .from("fiscal_nfe_emissao_configs")
    .select("nfeio_company_id")
    .eq("empresa_id", empresaId)
    .eq("provider_slug", "NFE_IO")
    .maybeSingle();
  const companyId = (cfg?.nfeio_company_id ?? "").toString().trim();
  if (!companyId) return json(409, { ok: false, error: "MISSING_NFEIO_COMPANY_ID" }, cors);

  const { data: link } = await admin
    .from("fiscal_nfe_nfeio_emissoes")
    .select("nfeio_id")
    .eq("emissao_id", emissaoId)
    .maybeSingle();
  const invoiceId = (link?.nfeio_id ?? "").toString().trim();
  if (!invoiceId) return json(409, { ok: false, error: "MISSING_NFEIO_ID" }, cors);

  const correctionText = (body.correction_text ?? "").trim();
  const payload =
    body.provider_payload && typeof body.provider_payload === "object"
      ? body.provider_payload
      : correctionText
      ? { correction: correctionText }
      : null;

  if (!payload) return json(400, { ok: false, error: "MISSING_PAYLOAD" }, cors);

  const base = nfeioBaseUrl(ambiente);
  const url = `${base}/v2/companies/${encodeURIComponent(companyId)}/productinvoices/${encodeURIComponent(invoiceId)}/correctionletter`;

  const { data: ev } = await admin.from("fiscal_nfe_provider_events").insert({
    empresa_id: empresaId,
    emissao_id: emissaoId,
    provider: "nfeio",
    event_type: "cce",
    status: "requested",
    request_id: requestId,
    request_payload: sanitizeForLog({ url, payload }),
  }).select("id").maybeSingle();

  const result = await nfeioFetchJson(url, {
    method: "PUT",
    headers: {
      "X-Api-Key": NFEIO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  await admin.from("fiscal_nfe_provider_events").update({
    status: result.ok ? "ok" : "error",
    http_status: result.status,
    response_payload: sanitizeForLog(result.data ?? {}),
    error_message: result.ok ? null : `HTTP_${result.status}`,
  }).eq("id", ev?.id ?? "");

  if (!result.ok) {
    return json(502, { ok: false, error: "NFEIO_CCE_FAILED", status: result.status, data: result.data }, cors);
  }

  await admin.from("fiscal_nfe_emissoes").update({ status: "processando", last_error: null }).eq("id", emissaoId);

  return json(200, { ok: true, data: result.data }, cors);
});
