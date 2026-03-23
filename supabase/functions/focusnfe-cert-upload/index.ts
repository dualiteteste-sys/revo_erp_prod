import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import { aesGcmEncryptToString } from "../_shared/crypto.ts";
import {
  focusFetch,
  json,
} from "../_shared/focusnfe-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Get the Focus NFe revenda (reseller) token.
 * The /v2/empresas PUT endpoint requires a reseller token to upload certs.
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" }, cors);
  }

  const { password } = body;
  if (!password || typeof password !== "string" || !password.trim()) {
    return json(400, { ok: false, error: "MISSING_PASSWORD", detail: "Informe a senha do certificado." }, cors);
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
    // Read emitente
    const { data: emitente } = await admin
      .from("fiscal_nfe_emitente")
      .select("*")
      .eq("empresa_id", empresaId)
      .single();
    if (!emitente) {
      return json(422, { ok: false, error: "EMITENTE_NOT_CONFIGURED", detail: "Preencha os dados do emitente antes de enviar o certificado." }, cors);
    }
    if (!emitente.certificado_storage_path) {
      return json(422, { ok: false, error: "NO_CERTIFICATE", detail: "Faça upload do certificado PFX primeiro." }, cors);
    }

    // Download PFX from Storage
    const { data: pfxData, error: dlErr } = await admin.storage
      .from("nfe_certificados")
      .download(emitente.certificado_storage_path);
    if (dlErr || !pfxData) {
      return json(500, { ok: false, error: "CERT_DOWNLOAD_FAILED", detail: "Erro ao baixar certificado do storage." }, cors);
    }

    const arrayBuffer = await pfxData.arrayBuffer();
    const pfxBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Encrypt and store password locally
    const masterKey = Deno.env.get("CERT_ENCRYPTION_KEY") || "";
    let encryptedPassword: string | null = null;
    if (masterKey) {
      encryptedPassword = await aesGcmEncryptToString({
        masterKey,
        plaintext: password.trim(),
        aad: empresaId,
      });
    }

    // Determine ambiente
    const { data: config } = await admin
      .from("fiscal_nfe_emissao_config")
      .select("ambiente")
      .eq("empresa_id", empresaId)
      .eq("provider_slug", "FOCUSNFE")
      .maybeSingle();
    const ambiente = config?.ambiente || "homologacao";

    const cnpj = (emitente.cnpj || "").replace(/\D/g, "");
    const revendaToken = getRevendaToken();

    // ── Strategy 1: Reseller token available → upload cert via Focus NFe API ──
    if (revendaToken) {
      const revendaBaseUrl = "https://api.focusnfe.com.br"; // reseller API is production-only

      const certPayload = {
        arquivo_certificado_base64: pfxBase64,
        senha_certificado: password.trim(),
      };

      // Check if empresa already exists on Focus NFe
      const { response: getResp } = await focusFetch(
        `${revendaBaseUrl}/v2/empresas/${cnpj}`,
        { method: "GET", token: revendaToken },
      );

      let response: Response;
      let data: any;

      if (getResp.status === 200) {
        // Empresa exists → PUT cert directly
        ({ response, data } = await focusFetch(
          `${revendaBaseUrl}/v2/empresas/${cnpj}`,
          { method: "PUT", token: revendaToken, body: JSON.stringify(certPayload) },
        ));
      } else {
        // Read serie + proximo_numero for registration
        const { data: numeracao } = await admin
          .from("fiscal_nfe_numeracao")
          .select("serie, proximo_numero")
          .eq("empresa_id", empresaId)
          .eq("ativo", true)
          .order("serie", { ascending: true })
          .limit(1)
          .maybeSingle();

        // Empresa not found → auto-register with emitente data + cert
        const empresaPayload: Record<string, any> = {
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
          ...certPayload,
        };

        // Include serie + numero_inicial if configured
        if (numeracao) {
          empresaPayload.serie_nfe_producao = String(numeracao.serie);
          empresaPayload.numero_inicial_nfe_producao = String(numeracao.proximo_numero);
        }

        ({ response, data } = await focusFetch(
          `${revendaBaseUrl}/v2/empresas`,
          { method: "POST", token: revendaToken, body: JSON.stringify(empresaPayload) },
        ));
      }

      if (!response.ok) {
        const errorMsg = data?.mensagem || data?.message || `HTTP ${response.status}`;
        const isWrongPassword = /senha|password|pkcs|decrypt/i.test(errorMsg);
        return json(422, {
          ok: false,
          error: isWrongPassword ? "WRONG_PASSWORD" : "CERT_UPLOAD_FAILED",
          detail: isWrongPassword
            ? "Senha incorreta para o certificado digital."
            : `Erro ao enviar certificado para Focus NFe: ${errorMsg}`,
        }, cors);
      }

      // Extract cert info from Focus NFe response
      const certInfo = {
        cnpj: data?.cnpj_certificado || cnpj,
        valid_until: data?.data_expiracao_certificado || null,
      };

      // Save per-company tokens if returned (from auto-registration)
      const updatePayload: Record<string, any> = {
        certificado_senha_encrypted: encryptedPassword,
        certificado_validade: certInfo.valid_until || null,
        certificado_cnpj: certInfo.cnpj || null,
        focusnfe_registrada: true,
        focusnfe_registrada_em: new Date().toISOString(),
        focusnfe_ultimo_erro: null,
      };
      const tokenProd = data?.token_producao || data?.token_producao_cnpj || null;
      const tokenHml = data?.token_homologacao || data?.token_homologacao_cnpj || null;
      if (tokenProd) updatePayload.focusnfe_token_producao = tokenProd;
      if (tokenHml) updatePayload.focusnfe_token_homologacao = tokenHml;

      await admin.from("fiscal_nfe_emitente").update(updatePayload).eq("empresa_id", empresaId);

      // Log
      const autoRegistered = getResp.status !== 200;
      try { await admin.from("fiscal_nfe_provider_logs").insert({
        empresa_id: empresaId,
        provider: "focusnfe",
        level: "info",
        message: autoRegistered
          ? `Empresa auto-registrada + certificado enviado para Focus NFe (${ambiente})`
          : `Certificado enviado para Focus NFe via API revenda (${ambiente})`,
        payload: { cnpj, request_id: requestId, auto_registered: autoRegistered },
      }); } catch { /* ignore log failures */ }

      return json(200, {
        ok: true,
        cert_info: certInfo,
        message: autoRegistered
          ? "Empresa registrada e certificado enviado para Focus NFe com sucesso."
          : "Certificado enviado para Focus NFe com sucesso.",
      }, cors);
    }

    // ── Strategy 2: No reseller token → store password locally ──
    // The cert will be included automatically when emitting NF-e via focusnfe-emit
    // which uses the emission token (per-company) and sends the cert in the payload.

    // Update emitente with encrypted password
    await admin.from("fiscal_nfe_emitente").update({
      certificado_senha_encrypted: encryptedPassword,
      focusnfe_ultimo_erro: null,
    }).eq("empresa_id", empresaId);

    // Log
    try { await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      provider: "focusnfe",
      level: "info",
      message: `Senha do certificado salva localmente (${ambiente})`,
      payload: { cnpj, request_id: requestId },
    }); } catch { /* ignore log failures */ }

    return json(200, {
      ok: true,
      cert_info: { cnpj, valid_until: null },
      message: "Senha do certificado salva com sucesso. O certificado será enviado automaticamente na emissão.",
    }, cors);
  } catch (err: any) {
    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message || "Erro interno ao processar certificado." }, cors);
  }
});
