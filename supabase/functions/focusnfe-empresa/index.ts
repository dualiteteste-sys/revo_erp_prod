import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import {
  getFocusApiToken,
  getFocusBaseUrl,
  basicAuth,
  focusFetch,
  json,
} from "../_shared/focusnfe-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Get the Focus NFe revenda (reseller) token.
 * The /v2/empresas endpoint requires a reseller token (production only).
 * Falls back to null if not configured.
 */
function getRevendaToken(): string | null {
  const token = (Deno.env.get("FOCUSNFE_REVENDA_TOKEN") ?? "").trim();
  return token || null;
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
        detail: "Preencha os dados do emitente em Configurações NF-e antes de registrar.",
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
    const emissionToken = getFocusApiToken(ambiente);
    if (!emissionToken) {
      return json(500, {
        ok: false,
        error: "MISSING_API_TOKEN",
        detail: "Token da API Focus NFe não configurado. Verifique os secrets do Supabase.",
      }, cors);
    }

    const cnpj = (emitente.cnpj || "").replace(/\D/g, "");
    const revendaToken = getRevendaToken();

    // ── Strategy 1: Reseller token available → use /v2/empresas API ──
    if (revendaToken) {
      const revendaBaseUrl = "https://api.focusnfe.com.br"; // reseller API is production-only

      // Build empresa payload (Focus NFe docs: wrap in { empresa: { ... } })
      const empresaPayload = {
        nome: emitente.razao_social,
        nome_fantasia: emitente.nome_fantasia || emitente.razao_social,
        cnpj,
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
        habilita_nfe: true,
        habilita_nfse: true,
      };

      // If certificate exists, include it with correct field names
      if (emitente.certificado_storage_path && emitente.certificado_senha_encrypted) {
        try {
          const { data: pfxData, error: dlErr } = await admin.storage
            .from("nfe_certificados")
            .download(emitente.certificado_storage_path);
          if (!dlErr && pfxData) {
            const arrayBuffer = await pfxData.arrayBuffer();
            const pfxBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            empresaPayload["arquivo_certificado_base64" as any] = pfxBase64;

            const { aesGcmDecryptFromString } = await import("../_shared/crypto.ts");
            const masterKey = Deno.env.get("CERT_ENCRYPTION_KEY") || "";
            if (masterKey) {
              const senha = await aesGcmDecryptFromString({
                masterKey,
                ciphertext: emitente.certificado_senha_encrypted,
                aad: empresaId,
              });
              empresaPayload["senha_certificado" as any] = senha;
            }
          }
        } catch (certErr: any) {
          console.warn(`[focusnfe-empresa] Could not include cert: ${certErr.message}`);
        }
      }

      // Check if empresa exists
      const { response: getResp } = await focusFetch(
        `${revendaBaseUrl}/v2/empresas/${cnpj}`,
        { method: "GET", token: revendaToken },
      );

      let result: any;
      if (getResp.status === 200) {
        // Update existing
        const { response, data } = await focusFetch(
          `${revendaBaseUrl}/v2/empresas/${cnpj}`,
          { method: "PUT", token: revendaToken, body: JSON.stringify(empresaPayload) },
        );
        result = data;
        if (!response.ok) {
          await admin.from("fiscal_nfe_emitente").update({
            focusnfe_ultimo_erro: result?.mensagem || `HTTP ${response.status}`,
          }).eq("empresa_id", empresaId);
          return json(422, {
            ok: false,
            error: "FOCUS_UPDATE_FAILED",
            detail: result?.mensagem || "Erro ao atualizar empresa na Focus NFe.",
          }, cors);
        }
      } else {
        // Create new
        const { response, data } = await focusFetch(
          `${revendaBaseUrl}/v2/empresas`,
          { method: "POST", token: revendaToken, body: JSON.stringify(empresaPayload) },
        );
        result = data;
        if (!response.ok) {
          await admin.from("fiscal_nfe_emitente").update({
            focusnfe_ultimo_erro: result?.mensagem || `HTTP ${response.status}`,
          }).eq("empresa_id", empresaId);
          return json(422, {
            ok: false,
            error: "FOCUS_CREATE_FAILED",
            detail: result?.mensagem || "Erro ao criar empresa na Focus NFe.",
          }, cors);
        }
      }

      // Success via reseller API
      await admin.from("fiscal_nfe_emitente").update({
        focusnfe_registrada: true,
        focusnfe_registrada_em: new Date().toISOString(),
        focusnfe_ultimo_erro: null,
      }).eq("empresa_id", empresaId);

      try { await admin.from("fiscal_nfe_provider_logs").insert({
        empresa_id: empresaId,
        provider: "focusnfe",
        level: "info",
        message: `Empresa registrada via API revenda (${ambiente})`,
        payload: { cnpj, request_id: requestId },
      }); } catch { /* ignore log failures */ }

      return json(200, {
        ok: true,
        message: "Empresa registrada na Focus NFe com sucesso.",
      }, cors);
    }

    // ── Strategy 2: No reseller token → validate emission token works ──
    const baseUrl = getFocusBaseUrl(ambiente);

    // Test the emission token with a dummy NF-e status check (expects 404 for non-existent ref, not 401)
    const testRef = `test_connection_${Date.now()}`;
    const testResp = await fetch(`${baseUrl}/v2/nfe/${testRef}`, {
      method: "GET",
      headers: { "Authorization": basicAuth(emissionToken) },
    });

    // 404 = token works, nota not found (expected)
    // 200 = token works, nota found
    // 401/403 = token invalid
    if (testResp.status === 401 || testResp.status === 403) {
      await admin.from("fiscal_nfe_emitente").update({
        focusnfe_ultimo_erro: `Token de emissão inválido (HTTP ${testResp.status})`,
      }).eq("empresa_id", empresaId);
      return json(422, {
        ok: false,
        error: "INVALID_EMISSION_TOKEN",
        detail: "O token de emissão da Focus NFe está inválido ou expirado. Verifique no painel da Focus NFe.",
      }, cors);
    }

    // Token works — mark as registered (company already exists in Focus NFe)
    await admin.from("fiscal_nfe_emitente").update({
      focusnfe_registrada: true,
      focusnfe_registrada_em: new Date().toISOString(),
      focusnfe_ultimo_erro: null,
    }).eq("empresa_id", empresaId);

    try { await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      provider: "focusnfe",
      level: "info",
      message: `Conexão validada com Focus NFe (${ambiente}) — empresa já registrada no painel`,
      payload: { cnpj, request_id: requestId, test_status: testResp.status },
    }); } catch { /* ignore log failures */ }

    return json(200, {
      ok: true,
      message: "Conexão validada. Empresa já registrada na Focus NFe.",
    }, cors);
  } catch (err: any) {
    return json(500, {
      ok: false,
      error: "INTERNAL_ERROR",
      detail: err?.message || "Erro interno ao registrar empresa.",
    }, cors);
  }
});
