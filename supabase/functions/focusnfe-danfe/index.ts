import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonRes(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function getFocusApiToken(ambiente: string): string {
  if (ambiente === "producao") {
    return (Deno.env.get("FOCUSNFE_API_TOKEN_PROD") ?? "").trim();
  }
  return (Deno.env.get("FOCUSNFE_API_TOKEN_HML") ?? "").trim();
}

async function getCompanyApiToken(admin: any, empresaId: string, ambiente: string): Promise<string> {
  const { data } = await admin
    .from("fiscal_nfe_emitente")
    .select("focusnfe_token_producao, focusnfe_token_homologacao")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const companyToken = ambiente === "producao"
    ? data?.focusnfe_token_producao
    : data?.focusnfe_token_homologacao;
  return (companyToken || "").trim() || getFocusApiToken(ambiente);
}

function getFocusBaseUrl(ambiente: string): string {
  if (ambiente === "producao") return "https://api.focusnfe.com.br";
  return "https://homologacao.focusnfe.com.br";
}

function basicAuth(token: string): string {
  return "Basic " + btoa(token + ":");
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return jsonRes(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) {
    return jsonRes(401, { ok: false, error: "MISSING_AUTH" }, cors);
  }

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonRes(401, { ok: false, error: "INVALID_TOKEN" }, cors);
  }

  const empresaId = req.headers.get("x-empresa-id") || "";
  if (!empresaId) {
    return jsonRes(400, { ok: false, error: "MISSING_EMPRESA_ID" }, cors);
  }

  const { data: membership } = await admin
    .from("empresa_usuarios")
    .select("role_id")
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return jsonRes(403, { ok: false, error: "NOT_MEMBER" }, cors);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonRes(400, { ok: false, error: "INVALID_JSON" }, cors);
  }

  const { emissao_id, type } = body;
  const docType = type === "xml" ? "xml" : "danfe";

  if (!emissao_id) {
    return jsonRes(400, { ok: false, error: "MISSING_EMISSAO_ID" }, cors);
  }

  // Verify emissao exists and belongs to empresa
  const { data: emissao } = await admin
    .from("fiscal_nfe_emissoes")
    .select("id, ambiente, status, numero")
    .eq("id", emissao_id)
    .eq("empresa_id", empresaId)
    .single();

  if (!emissao) {
    return jsonRes(404, { ok: false, error: "EMISSAO_NOT_FOUND" }, cors);
  }

  if (!["autorizada", "cancelada"].includes(emissao.status)) {
    return jsonRes(400, { ok: false, error: "NFE_NOT_AUTHORIZED", detail: `Status atual: ${emissao.status}` }, cors);
  }

  const ambiente = emissao.ambiente || "homologacao";
  const apiToken = await getCompanyApiToken(admin, empresaId, ambiente);
  if (!apiToken) {
    return jsonRes(500, { ok: false, error: "MISSING_API_TOKEN" }, cors);
  }

  const baseUrl = getFocusBaseUrl(ambiente);
  const authHeaders = { Authorization: basicAuth(apiToken) };

  // Step 1: Consult NFe to get download paths
  const consultUrl = `${baseUrl}/v2/nfe/${emissao_id}`;
  const consultRes = await fetch(consultUrl, { headers: authHeaders });

  if (!consultRes.ok) {
    return jsonRes(502, {
      ok: false,
      error: "FOCUS_CONSULT_ERROR",
      detail: `FocusNFe consulta retornou ${consultRes.status}. Verifique ambiente e referência.`,
    }, cors);
  }

  let consultData: any;
  try {
    consultData = await consultRes.json();
  } catch {
    return jsonRes(502, { ok: false, error: "FOCUS_PARSE_ERROR", detail: "Resposta da consulta não é JSON válido." }, cors);
  }

  // Step 2: Get the download path from consultation response
  const rawPath = docType === "xml"
    ? consultData?.caminho_xml_nota_fiscal
    : consultData?.caminho_danfe;

  if (!rawPath) {
    return jsonRes(404, {
      ok: false,
      error: "DOCUMENT_NOT_AVAILABLE",
      detail: `${docType === "xml" ? "XML" : "DANFE"} não disponível. Status FocusNFe: ${consultData?.status || "desconhecido"}.`,
    }, cors);
  }

  // Step 3: Build the download URL
  // FocusNFe returns caminho_danfe as a relative path (e.g. /arquivos_development/...)
  // or sometimes as a full URL with wrong domain. Always use FocusNFe base URL + path.
  let downloadUrl: string;
  try {
    const parsed = new URL(rawPath);
    // Full URL returned — replace domain with correct FocusNFe base
    downloadUrl = `${baseUrl}${parsed.pathname}`;
  } catch {
    // Relative path — prepend base URL
    downloadUrl = rawPath.startsWith("/") ? `${baseUrl}${rawPath}` : `${baseUrl}/${rawPath}`;
  }

  // Step 4: Download the file (with auth, following redirects)
  const fileRes = await fetch(downloadUrl, { headers: authHeaders, redirect: "follow" });

  if (!fileRes.ok) {
    return jsonRes(502, {
      ok: false,
      error: "FOCUS_DOWNLOAD_ERROR",
      detail: `Download retornou ${fileRes.status} de ${downloadUrl}`,
    }, cors);
  }

  const fileBytes = await fileRes.arrayBuffer();

  const contentType = docType === "xml" ? "application/xml" : "application/pdf";
  const ext = docType === "xml" ? "xml" : "pdf";
  const fileName = `nfe_${emissao.numero || emissao_id}.${ext}`;

  return new Response(fileBytes, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
});
