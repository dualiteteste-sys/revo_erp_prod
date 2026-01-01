import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { hasPermissionOrOwnerAdmin } from "../_shared/rbac.ts";
import { nfeioBaseUrl, type NfeioEnvironment } from "../_shared/nfeio.ts";
import { getRequestId } from "../_shared/request.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NFEIO_API_KEY = Deno.env.get("NFEIO_API_KEY") ?? "";

type DocType = "danfe_pdf" | "cce_pdf" | "cce_xml";
type Body = { emissao_id?: string; doc_type?: DocType };

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function fetchBinary(url: string, apiKey: string): Promise<{ ok: boolean; status: number; bytes: Uint8Array; contentType: string; rawText: string }> {
  const resp = await fetch(url, { headers: { "X-Api-Key": apiKey } });
  const contentType = resp.headers.get("content-type") ?? "application/octet-stream";
  if (!resp.ok) {
    const rawText = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, bytes: new Uint8Array(), contentType, rawText };
  }
  const ab = await resp.arrayBuffer();
  return { ok: true, status: resp.status, bytes: new Uint8Array(ab), contentType, rawText: "" };
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
  const docType = (body.doc_type ?? "").trim() as DocType;
  if (!emissaoId) return json(400, { ok: false, error: "MISSING_EMISSAO_ID" }, cors);
  if (!docType || !["danfe_pdf", "cce_pdf", "cce_xml"].includes(docType)) {
    return json(400, { ok: false, error: "INVALID_DOC_TYPE" }, cors);
  }

  const { data: emissao } = await user
    .from("fiscal_nfe_emissoes")
    .select("id,empresa_id,ambiente")
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
  const root = `${base}/v2/companies/${encodeURIComponent(companyId)}/productinvoices/${encodeURIComponent(invoiceId)}`;

  let url: string;
  let storagePath: string;
  let contentType = "application/octet-stream";
  let eventType: string;

  if (docType === "danfe_pdf") {
    url = `${root}/pdf`;
    storagePath = `${empresaId}/${emissaoId}/danfe.pdf`;
    contentType = "application/pdf";
    eventType = "fetch_pdf";
  } else if (docType === "cce_pdf") {
    url = `${root}/correctionletter/pdf`;
    storagePath = `${empresaId}/${emissaoId}/cce.pdf`;
    contentType = "application/pdf";
    eventType = "fetch_cce_pdf";
  } else {
    url = `${root}/correctionletter/xml`;
    storagePath = `${empresaId}/${emissaoId}/cce.xml`;
    contentType = "application/xml";
    eventType = "fetch_cce_xml";
  }

  const { data: ev } = await admin.from("fiscal_nfe_provider_events").insert({
    empresa_id: empresaId,
    emissao_id: emissaoId,
    provider: "nfeio",
    event_type: eventType,
    status: "requested",
    request_id: requestId,
    request_payload: sanitizeForLog({ url }),
  }).select("id").maybeSingle();

  const bin = await fetchBinary(url, NFEIO_API_KEY);
  if (!bin.ok) {
    await admin.from("fiscal_nfe_provider_events").update({
      status: "error",
      http_status: bin.status,
      response_payload: sanitizeForLog(bin.rawText ? { raw: bin.rawText } : {}),
      error_message: `HTTP_${bin.status}`,
    }).eq("id", ev?.id ?? "");
    return json(502, { ok: false, error: "NFEIO_DOC_FETCH_FAILED", status: bin.status, raw: bin.rawText }, cors);
  }

  await admin.storage.from("nfe_docs").upload(storagePath, new Blob([bin.bytes], { type: contentType }), {
    upsert: true,
    contentType: contentType,
  });

  if (docType === "danfe_pdf") {
    await admin.from("fiscal_nfe_nfeio_emissoes").update({ danfe_storage_path: storagePath }).eq("emissao_id", emissaoId);
  } else if (docType === "cce_pdf") {
    await admin.from("fiscal_nfe_nfeio_emissoes").update({ cce_pdf_storage_path: storagePath }).eq("emissao_id", emissaoId);
  } else {
    await admin.from("fiscal_nfe_nfeio_emissoes").update({ cce_xml_storage_path: storagePath }).eq("emissao_id", emissaoId);
  }

  await admin.from("fiscal_nfe_provider_events").update({
    status: "ok",
    http_status: bin.status,
    response_payload: sanitizeForLog({ storage_path: storagePath, content_type: contentType }),
  }).eq("id", ev?.id ?? "");

  return json(200, { ok: true, storage_path: storagePath }, cors);
});
