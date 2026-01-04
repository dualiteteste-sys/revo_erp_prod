import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { hasPermissionOrOwnerAdmin } from "../_shared/rbac.ts";
import { nfeioBaseUrl, nfeioFetchJson, type NfeioEnvironment } from "../_shared/nfeio.ts";
import { getRequestId } from "../_shared/request.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { rateLimitCheck } from "../_shared/rate_limit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NFEIO_API_KEY = Deno.env.get("NFEIO_API_KEY") ?? "";

type Body =
  | { mode: "numbers"; serie?: number; numero_inicial?: number; numero_final?: number; justificativa?: string; provider_payload?: any }
  | { mode: "invoice"; emissao_id?: string; provider_payload?: any };

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

  const body = (await req.json().catch(() => ({}))) as any as Body;
  const mode = (body as any).mode as string;
  if (mode !== "numbers" && mode !== "invoice") return json(400, { ok: false, error: "INVALID_MODE" }, cors);

  let empresaId: string;
  let ambiente: NfeioEnvironment = "homologacao";
  let endpointPath: string;
  let payload: any = {};
  let eventType: string;
  let emissaoId: string | null = null;

  if (mode === "invoice") {
    emissaoId = ((body as any).emissao_id ?? "").toString().trim();
    if (!emissaoId) return json(400, { ok: false, error: "MISSING_EMISSAO_ID" }, cors);

    const { data: emissao } = await user
      .from("fiscal_nfe_emissoes")
      .select("id,empresa_id,ambiente")
      .eq("id", emissaoId)
      .maybeSingle();
    if (!emissao?.id) return json(404, { ok: false, error: "EMISSAO_NOT_FOUND" }, cors);

    empresaId = emissao.empresa_id as string;
    ambiente = (emissao.ambiente ?? "homologacao") as NfeioEnvironment;

    const { data: link } = await admin
      .from("fiscal_nfe_nfeio_emissoes")
      .select("nfeio_id")
      .eq("emissao_id", emissaoId)
      .maybeSingle();
    const invoiceId = (link?.nfeio_id ?? "").toString().trim();
    if (!invoiceId) return json(409, { ok: false, error: "MISSING_NFEIO_ID" }, cors);

    endpointPath = `/v2/companies/:companyId/productinvoices/${encodeURIComponent(invoiceId)}/disablement`;
    eventType = "disablement_invoice";
    payload = (body as any).provider_payload && typeof (body as any).provider_payload === "object" ? (body as any).provider_payload : {};
  } else {
    const { data: empId } = await user.rpc("current_empresa_id");
    if (!empId) return json(403, { ok: false, error: "NO_ACTIVE_TENANT" }, cors);
    empresaId = typeof empId === "string" ? empId : (empId as any)?.id ?? empId;

    const { data: cfgRow } = await admin
      .from("fiscal_nfe_emissao_configs")
      .select("ambiente")
      .eq("empresa_id", empresaId)
      .eq("provider_slug", "NFE_IO")
      .maybeSingle();
    ambiente = ((cfgRow as any)?.ambiente ?? "homologacao") as NfeioEnvironment;

    endpointPath = "/v2/companies/:companyId/productinvoices/disablement";
    eventType = "disablement_numbers";

    payload =
      (body as any).provider_payload && typeof (body as any).provider_payload === "object"
        ? (body as any).provider_payload
        : {
            serie: Number((body as any).serie ?? 1),
            numeroInicial: Number((body as any).numero_inicial ?? 0),
            numeroFinal: Number((body as any).numero_final ?? 0),
            justificativa: ((body as any).justificativa ?? "").toString().trim(),
          };
  }

  const allowed = await hasPermissionOrOwnerAdmin(user, admin, userId, empresaId, "fiscal", "nfe_manage");
  if (!allowed) return json(403, { ok: false, error: "FORBIDDEN_RBAC" }, cors);

  const rl = await rateLimitCheck({
    admin,
    empresaId,
    domain: "nfeio",
    action: "disablement",
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    await admin.from("fiscal_nfe_provider_events").insert({
      empresa_id: empresaId,
      emissao_id: emissaoId,
      provider: "nfeio",
      event_type: "rate_limited",
      status: "error",
      request_id: requestId,
      request_payload: { action: "disablement", retry_after_seconds: rl.retry_after_seconds },
    });
    return json(429, { ok: false, error: "RATE_LIMITED", retry_after_seconds: rl.retry_after_seconds }, cors);
  }

  const { data: cfg } = await admin
    .from("fiscal_nfe_emissao_configs")
    .select("nfeio_company_id")
    .eq("empresa_id", empresaId)
    .eq("provider_slug", "NFE_IO")
    .maybeSingle();
  const companyId = (cfg?.nfeio_company_id ?? "").toString().trim();
  if (!companyId) return json(409, { ok: false, error: "MISSING_NFEIO_COMPANY_ID" }, cors);

  const base = nfeioBaseUrl(ambiente);
  const url = `${base}${endpointPath.replace(":companyId", encodeURIComponent(companyId))}`;

  const { data: ev } = await admin.from("fiscal_nfe_provider_events").insert({
    empresa_id: empresaId,
    emissao_id: emissaoId,
    provider: "nfeio",
    event_type: eventType,
    status: "requested",
    request_id: requestId,
    request_payload: sanitizeForLog({ url, payload }),
  }).select("id").maybeSingle();

  const result = await nfeioFetchJson(url, {
    method: "POST",
    headers: {
      "X-Api-Key": NFEIO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });

  await admin.from("fiscal_nfe_provider_events").update({
    status: result.ok ? "ok" : "error",
    http_status: result.status,
    response_payload: sanitizeForLog(result.data ?? {}),
    error_message: result.ok ? null : `HTTP_${result.status}`,
  }).eq("id", ev?.id ?? "");

  if (!result.ok) return json(502, { ok: false, error: "NFEIO_DISABLEMENT_FAILED", status: result.status, data: result.data }, cors);

  if (emissaoId) {
    await admin.from("fiscal_nfe_emissoes").update({ status: "processando", last_error: null }).eq("id", emissaoId);
  }

  return json(200, { ok: true, data: result.data }, cors);
});
