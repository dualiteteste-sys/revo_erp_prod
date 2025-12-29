import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { hasPermissionOrOwnerAdmin } from "../_shared/rbac.ts";
import { nfeioBaseUrl, type NfeioEnvironment } from "../_shared/nfeio.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NFEIO_API_KEY = Deno.env.get("NFEIO_API_KEY") ?? "";

type Body = { emissao_id?: string };

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

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

  // valida acesso via RLS
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

  const base = nfeioBaseUrl(ambiente);
  const url = `${base}/v2/companies/${encodeURIComponent(companyId)}/productinvoices/${encodeURIComponent(invoiceId)}`;

  const { data: ev } = await admin.from("fiscal_nfe_provider_events").insert({
    empresa_id: empresaId,
    emissao_id: emissaoId,
    provider: "nfeio",
    event_type: "cancel",
    status: "requested",
    request_payload: sanitizeForLog({ url }),
  }).select("id").maybeSingle();

  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      "X-Api-Key": NFEIO_API_KEY,
      "Content-Type": "application/json",
    },
  });

  // cancela é assíncrono: aguarda webhooks/worker para refletir status final
  if (resp.ok && resp.status === 204) {
    await admin.from("fiscal_nfe_provider_events").update({
      status: "ok",
      http_status: resp.status,
      response_payload: {},
    }).eq("id", ev?.id ?? "");
    await admin.from("fiscal_nfe_emissoes").update({ status: "processando", last_error: null }).eq("id", emissaoId);
    return json(200, { ok: true }, cors);
  }

  const raw = await resp.text().catch(() => "");
  await admin.from("fiscal_nfe_provider_events").update({
    status: "error",
    http_status: resp.status,
    response_payload: sanitizeForLog(raw ? { raw } : {}),
    error_message: `HTTP_${resp.status}`,
  }).eq("id", ev?.id ?? "");

  return json(502, { ok: false, error: "NFEIO_CANCEL_FAILED", status: resp.status, raw }, cors);
});
