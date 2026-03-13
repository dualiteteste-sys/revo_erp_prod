import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import {
  getFocusBaseUrl,
  getCompanyApiToken,
  focusFetch,
  json,
} from "../_shared/focusnfe-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) return json(401, { ok: false, error: "MISSING_AUTH" }, cors);

  const requestId = getRequestId(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" }, cors);
  }

  const { nfse_id } = body;
  if (!nfse_id) {
    return json(400, { ok: false, error: "MISSING_NFSE_ID" }, cors);
  }

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json(401, { ok: false, error: "INVALID_TOKEN" }, cors);

  const empresaId = req.headers.get("x-empresa-id") || "";
  if (!empresaId) return json(400, { ok: false, error: "MISSING_EMPRESA_ID" }, cors);

  const { data: membership } = await admin
    .from("empresa_usuarios")
    .select("role_id")
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return json(403, { ok: false, error: "NOT_MEMBER" }, cors);

  try {
    const { data: nfse } = await admin
      .from("fiscal_nfse_emissoes")
      .select("id, status, ambiente, focusnfe_ref")
      .eq("id", nfse_id)
      .eq("empresa_id", empresaId)
      .single();
    if (!nfse) return json(404, { ok: false, error: "NFSE_NOT_FOUND" }, cors);

    const ref = nfse.focusnfe_ref || nfse_id;
    const ambiente = nfse.ambiente || "homologacao";
    const apiToken = await getCompanyApiToken(admin, empresaId, ambiente);
    if (!apiToken) return json(500, { ok: false, error: "MISSING_API_TOKEN" }, cors);

    const baseUrl = getFocusBaseUrl(ambiente);
    const { response, data } = await focusFetch(
      `${baseUrl}/v2/nfse/${ref}`,
      { method: "GET", token: apiToken },
    );

    if (!response.ok) {
      return json(response.status, {
        ok: false, error: "FOCUS_API_ERROR", detail: data?.mensagem,
      }, cors);
    }

    const focusStatus = data?.status || "";

    if (focusStatus === "autorizado" && nfse.status !== "autorizada") {
      await admin.from("fiscal_nfse_emissoes").update({
        status: "autorizada",
        numero: data?.numero || null,
        codigo_verificacao: data?.codigo_verificacao || null,
        url_nota: data?.url || null,
        pdf_url: data?.caminho_xml_nota_fiscal || null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", nfse_id);
    } else if (focusStatus === "erro_autorizacao" && nfse.status !== "rejeitada") {
      await admin.from("fiscal_nfse_emissoes").update({
        status: "rejeitada",
        last_error: data?.mensagem || null,
        updated_at: new Date().toISOString(),
      }).eq("id", nfse_id);
    } else if (focusStatus === "cancelado" && nfse.status !== "cancelada") {
      await admin.from("fiscal_nfse_emissoes").update({
        status: "cancelada",
        cancelada_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", nfse_id);
    }

    return json(200, {
      ok: true,
      status: focusStatus,
      focus_data: data,
    }, cors);
  } catch (err: any) {
    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
