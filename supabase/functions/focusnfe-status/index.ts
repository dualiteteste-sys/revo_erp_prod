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

function getFocusApiToken(ambiente: string): string {
  if (ambiente === "producao") {
    return (Deno.env.get("FOCUSNFE_API_TOKEN_PROD") ?? "").trim();
  }
  return (Deno.env.get("FOCUSNFE_API_TOKEN_HML") ?? "").trim();
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

    // If already terminal, just return current status
    if (["autorizada", "cancelada"].includes(emissao.status)) {
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
    const apiToken = getFocusApiToken(ambiente);
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
      return json(200, {
        ok: true,
        status: "processando",
        detail: "Aguardando resposta da SEFAZ",
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

      // Update provider link
      await admin.from("fiscal_nfe_nfeio_emissoes").update({
        provider_status: "autorizado",
        response_payload: focusData,
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
      await admin.from("fiscal_nfe_emissoes").update({
        status: "rejeitada",
        last_error: errorMsg,
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
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: "error",
      message: `Status poll error: ${err?.message || String(err)}`,
      payload: { stack: err?.stack, request_id: requestId },
    }).catch(() => {});

    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
