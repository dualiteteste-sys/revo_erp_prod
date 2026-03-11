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
    // Read emitente data
    const { data: emitente, error: emitErr } = await admin
      .from("fiscal_nfe_emitente")
      .select("*")
      .eq("empresa_id", empresaId)
      .single();
    if (emitErr || !emitente) {
      return json(422, {
        ok: false,
        error: "EMITENTE_NOT_CONFIGURED",
        detail: "Preencha os dados do emitente em Configurações NF-e antes de registrar na Focus NFe.",
      }, cors);
    }

    // Determine ambiente from config
    const { data: config } = await admin
      .from("fiscal_nfe_emissao_config")
      .select("ambiente")
      .eq("empresa_id", empresaId)
      .eq("provider_slug", "FOCUSNFE")
      .maybeSingle();
    const ambiente = config?.ambiente || "homologacao";
    const apiToken = getFocusApiToken(ambiente);
    if (!apiToken) {
      return json(500, { ok: false, error: "MISSING_API_TOKEN" }, cors);
    }

    // Build empresa payload for Focus NFe
    const empresaPayload: Record<string, any> = {
      nome: emitente.razao_social,
      nome_fantasia: emitente.nome_fantasia || emitente.razao_social,
      cnpj: (emitente.cnpj || "").replace(/\D/g, ""),
      inscricao_estadual: emitente.ie || "",
      inscricao_municipal: emitente.im || "",
      regime_tributario: String(emitente.crt || 1),
      logradouro: emitente.endereco_logradouro || "",
      numero: emitente.endereco_numero || "S/N",
      complemento: emitente.endereco_complemento || "",
      bairro: emitente.endereco_bairro || "",
      municipio: emitente.endereco_municipio || "",
      uf: emitente.endereco_uf || "",
      cep: (emitente.endereco_cep || "").replace(/\D/g, ""),
      telefone: (emitente.telefone || "").replace(/\D/g, ""),
      email: emitente.email || "",
    };

    // If certificate exists, include it
    if (emitente.certificado_storage_path && emitente.certificado_senha_encrypted) {
      try {
        const { data: pfxData, error: dlErr } = await admin.storage
          .from("nfe_certificados")
          .download(emitente.certificado_storage_path);
        if (!dlErr && pfxData) {
          const arrayBuffer = await pfxData.arrayBuffer();
          const pfxBase64 = btoa(
            String.fromCharCode(...new Uint8Array(arrayBuffer)),
          );
          empresaPayload.arquivo_certificado_digital = pfxBase64;

          // Decrypt password
          const { aesGcmDecryptFromString } = await import("../_shared/crypto.ts");
          const masterKey = Deno.env.get("CERT_ENCRYPTION_KEY") || "";
          if (masterKey) {
            const senha = await aesGcmDecryptFromString({
              masterKey,
              ciphertext: emitente.certificado_senha_encrypted,
              aad: empresaId,
            });
            empresaPayload.senha_certificado_digital = senha;
          }
        }
      } catch (certErr: any) {
        console.warn(`[focusnfe-empresa] Could not include cert: ${certErr.message}`);
      }
    }

    const cnpj = empresaPayload.cnpj;
    const baseUrl = getFocusBaseUrl(ambiente);

    // Try to get existing empresa first
    const { response: getResp } = await focusFetch(
      `${baseUrl}/v2/empresas/${cnpj}`,
      { method: "GET", token: apiToken },
    );

    let result: any;
    if (getResp.status === 200) {
      // Update existing
      const { response, data } = await focusFetch(
        `${baseUrl}/v2/empresas/${cnpj}`,
        { method: "PUT", token: apiToken, body: JSON.stringify(empresaPayload) },
      );
      result = data;
      if (!response.ok) {
        await admin.from("fiscal_nfe_emitente").update({
          focusnfe_ultimo_erro: result?.mensagem || `HTTP ${response.status}`,
        }).eq("empresa_id", empresaId);
        return json(response.status >= 500 ? 502 : 422, {
          ok: false, error: "FOCUS_UPDATE_FAILED", detail: result?.mensagem,
        }, cors);
      }
    } else {
      // Create new
      const { response, data } = await focusFetch(
        `${baseUrl}/v2/empresas`,
        { method: "POST", token: apiToken, body: JSON.stringify(empresaPayload) },
      );
      result = data;
      if (!response.ok) {
        await admin.from("fiscal_nfe_emitente").update({
          focusnfe_ultimo_erro: result?.mensagem || `HTTP ${response.status}`,
        }).eq("empresa_id", empresaId);
        return json(response.status >= 500 ? 502 : 422, {
          ok: false, error: "FOCUS_CREATE_FAILED", detail: result?.mensagem,
        }, cors);
      }
    }

    // Update registration status
    await admin.from("fiscal_nfe_emitente").update({
      focusnfe_registrada: true,
      focusnfe_registrada_em: new Date().toISOString(),
      focusnfe_ultimo_erro: null,
    }).eq("empresa_id", empresaId);

    // Log
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      provider: "focusnfe",
      level: "info",
      message: `Empresa registered/updated on Focus NFe (${ambiente})`,
      payload: { cnpj, request_id: requestId },
    }).catch(() => {});

    return json(200, { ok: true, message: "Empresa registrada na Focus NFe com sucesso." }, cors);
  } catch (err: any) {
    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
