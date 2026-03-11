import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import { aesGcmEncryptToString } from "../_shared/crypto.ts";
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" }, cors);
  }

  const { password } = body;
  if (!password || typeof password !== "string" || !password.trim()) {
    return json(400, { ok: false, error: "MISSING_PASSWORD" }, cors);
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
      return json(422, { ok: false, error: "EMITENTE_NOT_CONFIGURED" }, cors);
    }
    if (!emitente.certificado_storage_path) {
      return json(422, { ok: false, error: "NO_CERTIFICATE", detail: "Faça upload do certificado PFX primeiro." }, cors);
    }

    // Download PFX from Storage
    const { data: pfxData, error: dlErr } = await admin.storage
      .from("nfe_certificados")
      .download(emitente.certificado_storage_path);
    if (dlErr || !pfxData) {
      return json(500, { ok: false, error: "CERT_DOWNLOAD_FAILED", detail: dlErr?.message }, cors);
    }

    const arrayBuffer = await pfxData.arrayBuffer();
    const pfxBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Determine ambiente
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

    const cnpj = (emitente.cnpj || "").replace(/\D/g, "");
    const baseUrl = getFocusBaseUrl(ambiente);

    // Upload certificate to Focus NFe via empresa update
    const { response, data } = await focusFetch(
      `${baseUrl}/v2/empresas/${cnpj}`,
      {
        method: "PUT",
        token: apiToken,
        body: JSON.stringify({
          arquivo_certificado_digital: pfxBase64,
          senha_certificado_digital: password.trim(),
        }),
      },
    );

    if (!response.ok) {
      const errorMsg = data?.mensagem || data?.message || `HTTP ${response.status}`;
      const isWrongPassword = /senha|password|pkcs|decrypt/i.test(errorMsg);
      return json(422, {
        ok: false,
        error: isWrongPassword ? "WRONG_PASSWORD" : "CERT_UPLOAD_FAILED",
        detail: errorMsg,
      }, cors);
    }

    // Encrypt and store password locally as backup
    const masterKey = Deno.env.get("CERT_ENCRYPTION_KEY") || "";
    let encryptedPassword: string | null = null;
    if (masterKey) {
      encryptedPassword = await aesGcmEncryptToString({
        masterKey,
        plaintext: password.trim(),
        aad: empresaId,
      });
    }

    // Extract cert info from Focus NFe response if available
    const certInfo = {
      cnpj: data?.cnpj_certificado || cnpj,
      valid_until: data?.data_expiracao_certificado || null,
    };

    // Update emitente with cert info
    await admin.from("fiscal_nfe_emitente").update({
      certificado_senha_encrypted: encryptedPassword,
      certificado_validade: certInfo.valid_until || null,
      certificado_cnpj: certInfo.cnpj || null,
      focusnfe_registrada: true,
      focusnfe_registrada_em: new Date().toISOString(),
      focusnfe_ultimo_erro: null,
    }).eq("empresa_id", empresaId);

    // Log
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      provider: "focusnfe",
      level: "info",
      message: `Certificate uploaded to Focus NFe (${ambiente})`,
      payload: { cnpj, request_id: requestId },
    }).catch(() => {});

    return json(200, {
      ok: true,
      cert_info: certInfo,
      message: "Certificado enviado para Focus NFe com sucesso.",
    }, cors);
  } catch (err: any) {
    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
