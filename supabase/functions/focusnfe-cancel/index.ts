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

  const { emissao_id, justificativa } = body;
  if (!emissao_id) {
    return json(400, { ok: false, error: "MISSING_EMISSAO_ID" }, cors);
  }
  if (!justificativa || justificativa.trim().length < 15) {
    return json(400, {
      ok: false,
      error: "JUSTIFICATIVA_REQUIRED",
      detail: "Justificativa deve ter no mínimo 15 caracteres.",
    }, cors);
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
    // Read emissao
    const { data: emissao } = await admin
      .from("fiscal_nfe_emissoes")
      .select("id, status, ambiente")
      .eq("id", emissao_id)
      .eq("empresa_id", empresaId)
      .single();
    if (!emissao) {
      return json(404, { ok: false, error: "EMISSAO_NOT_FOUND" }, cors);
    }
    if (emissao.status !== "autorizada") {
      return json(409, {
        ok: false,
        error: "INVALID_STATUS",
        detail: `Só é possível cancelar NF-e autorizada. Status atual: ${emissao.status}`,
      }, cors);
    }

    const ambiente = emissao.ambiente || "homologacao";
    const apiToken = await getCompanyApiToken(admin, empresaId, ambiente);
    if (!apiToken) return json(500, { ok: false, error: "MISSING_API_TOKEN" }, cors);

    const baseUrl = getFocusBaseUrl(ambiente);
    const ref = emissao_id;

    // Call Focus NFe cancel API
    const { response, data } = await focusFetch(
      `${baseUrl}/v2/nfe/${ref}`,
      {
        method: "DELETE",
        token: apiToken,
        body: JSON.stringify({ justificativa: justificativa.trim() }),
      },
    );

    // Log
    try { await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: response.ok ? "info" : "error",
      message: `NF-e cancel: ${response.status}`,
      payload: { ref, status: response.status, body: data, request_id: requestId },
    }); } catch { /* ignore log failures */ }

    if (response.ok) {
      const focusStatus = data?.status || "";
      if (focusStatus === "cancelado") {
        await admin.from("fiscal_nfe_emissoes").update({
          status: "cancelada",
          cancelada_em: new Date().toISOString(),
          cancelamento_justificativa: justificativa.trim(),
          cancelamento_protocolo: data?.protocolo_cancelamento || null,
          updated_at: new Date().toISOString(),
        }).eq("id", emissao_id);
      } else {
        // Processing cancellation
        await admin.from("fiscal_nfe_emissoes").update({
          status: "processando",
          updated_at: new Date().toISOString(),
        }).eq("id", emissao_id);
      }

      return json(200, {
        ok: true,
        status: focusStatus || "processando",
        message: "Cancelamento solicitado com sucesso.",
      }, cors);
    } else {
      const errorMsg = data?.mensagem || data?.message || `HTTP ${response.status}`;
      return json(response.status >= 500 ? 502 : 422, {
        ok: false,
        error: "CANCEL_FAILED",
        detail: errorMsg,
      }, cors);
    }
  } catch (err: any) {
    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
