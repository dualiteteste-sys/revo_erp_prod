import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import {
  getFocusApiToken,
  getFocusBaseUrl,
  focusFetch,
  json,
} from "../_shared/focusnfe-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Map our status names to Focus NFe tipo parameter
const TIPO_MAP: Record<string, string> = {
  ciencia: "ciencia",
  confirmacao: "confirmacao",
  desconhecimento: "desconhecimento",
  nao_realizada: "nao_realizada",
};

// Map our tipo to the DB status value
const TIPO_TO_STATUS: Record<string, string> = {
  ciencia: "ciencia",
  confirmacao: "confirmada",
  desconhecimento: "desconhecida",
  nao_realizada: "nao_realizada",
};

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

  const { nfeDestinadaIds, tipo, justificativa } = body;
  if (!Array.isArray(nfeDestinadaIds) || nfeDestinadaIds.length === 0) {
    return json(400, { ok: false, error: "MISSING_IDS" }, cors);
  }
  if (!tipo || !TIPO_MAP[tipo]) {
    return json(400, { ok: false, error: "INVALID_TIPO", detail: `Valid: ${Object.keys(TIPO_MAP).join(", ")}` }, cors);
  }
  if (tipo === "nao_realizada" && (!justificativa || justificativa.trim().length < 15)) {
    return json(400, { ok: false, error: "JUSTIFICATIVA_REQUIRED", detail: "Mínimo 15 caracteres." }, cors);
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
    // Get emitente + config
    const { data: emitente } = await admin
      .from("fiscal_nfe_emitente")
      .select("cnpj, focusnfe_registrada")
      .eq("empresa_id", empresaId)
      .single();
    if (!emitente || !emitente.focusnfe_registrada) {
      return json(422, { ok: false, error: "NOT_REGISTERED" }, cors);
    }

    const { data: config } = await admin
      .from("fiscal_nfe_emissao_config")
      .select("ambiente")
      .eq("empresa_id", empresaId)
      .eq("provider_slug", "FOCUSNFE")
      .maybeSingle();
    const ambiente = config?.ambiente || "homologacao";
    const apiToken = getFocusApiToken(ambiente);
    if (!apiToken) return json(500, { ok: false, error: "MISSING_API_TOKEN" }, cors);

    // Load NF-e destinadas
    const { data: nfes } = await admin
      .from("fiscal_nfe_destinadas")
      .select("id, chave_acesso, status")
      .in("id", nfeDestinadaIds)
      .eq("empresa_id", empresaId);

    if (!nfes || nfes.length === 0) {
      return json(404, { ok: false, error: "NO_NFES_FOUND" }, cors);
    }

    const baseUrl = getFocusBaseUrl(ambiente);
    const results: Array<{
      nfe_destinada_id: string;
      chave_acesso: string;
      status: string;
      success: boolean;
      error?: string;
    }> = [];

    let successCount = 0;
    let failCount = 0;

    for (const nfe of nfes) {
      try {
        // Build manifestation payload
        const manifestPayload: Record<string, any> = { tipo: TIPO_MAP[tipo] };
        if (tipo === "nao_realizada" && justificativa) {
          manifestPayload.justificativa = justificativa.trim();
        }

        // Call Focus NFe MDe manifestation
        const { response, data } = await focusFetch(
          `${baseUrl}/v2/nfes_recebidas/${nfe.chave_acesso}/manifesto`,
          { method: "POST", token: apiToken, body: JSON.stringify(manifestPayload) },
        );

        if (response.ok) {
          // Update local status
          const dbStatus = TIPO_TO_STATUS[tipo];
          await admin.rpc("fiscal_nfe_destinadas_manifestar", {
            p_ids: [nfe.id],
            p_status: dbStatus,
            p_justificativa: justificativa?.trim() || null,
            p_evento_protocolo: data?.protocolo || null,
            p_evento_cstat: data?.codigo_status || null,
            p_evento_dh_registro: null,
          });

          results.push({
            nfe_destinada_id: nfe.id,
            chave_acesso: nfe.chave_acesso,
            status: dbStatus,
            success: true,
          });
          successCount++;

          // After ciencia, try to download full XML
          if (tipo === "ciencia") {
            try {
              const { response: xmlResp, data: xmlData } = await focusFetch(
                `${baseUrl}/v2/nfes_recebidas/${nfe.chave_acesso}/xml`,
                { method: "GET", token: apiToken },
              );
              if (xmlResp.ok && xmlData?.xml) {
                // Store XML in storage
                const xmlPath = `${empresaId}/destinadas/${nfe.chave_acesso}.xml`;
                await admin.storage
                  .from("nfe_certificados")
                  .upload(xmlPath, xmlData.xml, {
                    contentType: "application/xml",
                    upsert: true,
                  });
                await admin
                  .from("fiscal_nfe_destinadas")
                  .update({ xml_completo_path: xmlPath })
                  .eq("id", nfe.id);
              }
            } catch (xmlErr: any) {
              console.warn(`[mde-manifestar] XML download failed for ${nfe.chave_acesso}: ${xmlErr.message}`);
            }
          }
        } else {
          const errorMsg = data?.mensagem || data?.message || `HTTP ${response.status}`;
          results.push({
            nfe_destinada_id: nfe.id,
            chave_acesso: nfe.chave_acesso,
            status: nfe.status,
            success: false,
            error: errorMsg,
          });
          failCount++;
        }
      } catch (err: any) {
        results.push({
          nfe_destinada_id: nfe.id,
          chave_acesso: nfe.chave_acesso,
          status: nfe.status,
          success: false,
          error: err.message,
        });
        failCount++;
      }
    }

    // Log
    try { await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      provider: "focusnfe",
      level: failCount > 0 ? "warn" : "info",
      message: `MDe manifestation: ${successCount} ok, ${failCount} failed (tipo: ${tipo})`,
      payload: { tipo, total: nfes.length, request_id: requestId },
    }); } catch { /* ignore log failures */ }

    return json(200, {
      ok: true,
      success_count: successCount,
      fail_count: failCount,
      results,
    }, cors);
  } catch (err: any) {
    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
