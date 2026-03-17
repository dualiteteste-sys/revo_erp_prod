import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// NFE-STA-01: extract SEFAZ rejection code from error message
function parseRejectionCode(mensagem: string | null | undefined): string | null {
  if (!mensagem) return null;
  const m = mensagem.match(/Rejei[çc][aã]o:?\s*(\d{3,4})/i);
  return m ? m[1] : null;
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
  if (ambiente === "producao") {
    return "https://api.focusnfe.com.br";
  }
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
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) {
    return json(401, { ok: false, error: "MISSING_AUTH" }, cors);
  }

  const requestId = getRequestId(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" }, cors);
  }

  const { emissao_id } = body;
  if (!emissao_id) {
    return json(400, { ok: false, error: "MISSING_EMISSAO_ID" }, cors);
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
    return json(401, { ok: false, error: "INVALID_TOKEN" }, cors);
  }

  const empresaId = req.headers.get("x-empresa-id") || "";
  if (!empresaId) {
    return json(400, { ok: false, error: "MISSING_EMPRESA_ID" }, cors);
  }

  const { data: membership } = await admin
    .from("empresa_usuarios")
    .select("role_id")
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return json(403, { ok: false, error: "NOT_MEMBER" }, cors);
  }

  try {
    // Read emissao
    const { data: emissao } = await admin
      .from("fiscal_nfe_emissoes")
      .select("id, status, ambiente, chave_acesso, numero, last_error")
      .eq("id", emissao_id)
      .eq("empresa_id", empresaId)
      .single();
    if (!emissao) {
      return json(404, { ok: false, error: "EMISSAO_NOT_FOUND" }, cors);
    }

    // If already terminal, check if DANFE URL is missing and backfill if needed
    if (["autorizada", "cancelada"].includes(emissao.status)) {
      // Check if DANFE URL exists in provider link
      const { data: providerLink } = await admin
        .from("fiscal_nfe_nfeio_emissoes")
        .select("danfe_url, xml_url")
        .eq("emissao_id", emissao_id)
        .maybeSingle();

      if (emissao.status === "autorizada" && (!providerLink?.danfe_url || !providerLink?.xml_url)) {
        // Backfill: consult FocusNFe to get proper download paths
        const ambiente = emissao.ambiente || "homologacao";
        const bUrl = getFocusBaseUrl(ambiente);
        const backfillToken = await getCompanyApiToken(admin, empresaId, ambiente);
        if (backfillToken) {
          try {
            const consultRes = await fetch(`${bUrl}/v2/nfe/${emissao_id}`, {
              headers: { Authorization: basicAuth(backfillToken) },
            });
            if (consultRes.ok) {
              const consultData = await consultRes.json();
              const danfeUrl = consultData?.caminho_danfe ? `${bUrl}${consultData.caminho_danfe}` : null;
              const xmlUrl = consultData?.caminho_xml_nota_fiscal ? `${bUrl}${consultData.caminho_xml_nota_fiscal}` : null;
              if (danfeUrl || xmlUrl) {
                await admin.from("fiscal_nfe_nfeio_emissoes").update({
                  ...(danfeUrl ? { danfe_url: danfeUrl } : {}),
                  ...(xmlUrl ? { xml_url: xmlUrl } : {}),
                  last_sync_at: new Date().toISOString(),
                }).eq("emissao_id", emissao_id);
              }
            }
          } catch { /* backfill is best-effort */ }
        }
      }

      return json(200, {
        ok: true,
        status: emissao.status,
        chave_acesso: emissao.chave_acesso,
        numero: emissao.numero,
      }, cors);
    }

    // Only poll Focus if status is processando
    if (emissao.status !== "processando") {
      return json(200, {
        ok: true,
        status: emissao.status,
        detail: emissao.last_error,
      }, cors);
    }

    // Consult Focus NFe API
    const ambiente = emissao.ambiente || "homologacao";
    const apiToken = await getCompanyApiToken(admin, empresaId, ambiente);
    if (!apiToken) {
      return json(500, { ok: false, error: "MISSING_API_TOKEN" }, cors);
    }

    const ref = emissao_id;
    const baseUrl = getFocusBaseUrl(ambiente);
    const url = `${baseUrl}/v2/nfe/${ref}`;

    const focusResponse = await fetch(url, {
      method: "GET",
      headers: { Authorization: basicAuth(apiToken) },
    });

    const focusBody = await focusResponse.text();
    let focusData: any;
    try {
      focusData = JSON.parse(focusBody);
    } catch {
      focusData = { raw: focusBody };
    }

    // Log
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: focusResponse.ok ? "info" : "warn",
      message: `Status poll: ${focusResponse.status}`,
      payload: { status: focusResponse.status, body: focusData, request_id: requestId },
    });

    if (!focusResponse.ok) {
      const isUnavailable = focusResponse.status >= 500 || focusResponse.status === 429;
      return json(200, {
        ok: true,
        status: "processando",
        detail: isUnavailable
          ? "SEFAZ temporariamente indisponível. Retentando automaticamente."
          : "Aguardando resposta da SEFAZ",
        focus_response: focusData,
      }, cors);
    }

    const focusStatus = focusData?.status || "";

    if (focusStatus === "autorizado") {
      await admin.from("fiscal_nfe_emissoes").update({
        status: "autorizada",
        chave_acesso: focusData?.chave_nfe || null,
        numero: focusData?.numero ? parseInt(focusData.numero) : null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", emissao_id);

      // Update provider link with DANFE/XML URLs
      // caminho_danfe/caminho_xml are relative paths — prepend Focus base URL
      const danfeUrl = focusData?.caminho_danfe ? `${baseUrl}${focusData.caminho_danfe}` : null;
      const xmlUrl = focusData?.caminho_xml_nota_fiscal ? `${baseUrl}${focusData.caminho_xml_nota_fiscal}` : null;
      await admin.from("fiscal_nfe_nfeio_emissoes").update({
        provider_status: "autorizado",
        response_payload: focusData,
        danfe_url: danfeUrl,
        xml_url: xmlUrl,
        last_sync_at: new Date().toISOString(),
      }).eq("emissao_id", emissao_id);

      return json(200, {
        ok: true,
        status: "autorizada",
        chave_acesso: focusData?.chave_nfe,
        numero: focusData?.numero,
        focus_response: focusData,
      }, cors);
    }

    if (focusStatus === "erro_autorizacao" || focusStatus === "rejeitado") {
      const errorMsg = focusData?.mensagem || focusData?.mensagem_sefaz || "";
      const rejectionCode = parseRejectionCode(errorMsg);
      const { data: curRow } = await admin.from("fiscal_nfe_emissoes")
        .select("reprocess_count").eq("id", emissao_id).single();
      await admin.from("fiscal_nfe_emissoes").update({
        status: "rejeitada",
        last_error: errorMsg,
        rejection_code: rejectionCode,
        reprocess_count: (curRow?.reprocess_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", emissao_id);

      return json(200, {
        ok: true,
        status: "rejeitada",
        detail: errorMsg,
        focus_response: focusData,
      }, cors);
    }

    // Still processing
    return json(200, {
      ok: true,
      status: "processando",
      detail: focusData?.mensagem || "Aguardando SEFAZ",
      focus_response: focusData,
    }, cors);
  } catch (err: any) {
    try { await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: "error",
      message: `Status poll error: ${err?.message || String(err)}`,
      payload: { stack: err?.stack, request_id: requestId },
    }); } catch { /* ignore log failures */ }

    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
