/**
 * Edge Function: inter-boleto
 *
 * Authenticated endpoint for Banco Inter boleto operations:
 *   - action=register  → Register boleto in Inter API
 *   - action=status    → Query boleto status
 *   - action=pdf       → Download boleto PDF (base64)
 *   - action=cancel    → Cancel boleto
 *   - action=test      → Test Inter connection (diagnostics)
 *   - action=save-secrets → Save encrypted credentials (client_secret, cert, key)
 *
 * Headers: Authorization (Bearer JWT), x-empresa-id
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import { aesGcmEncryptToString } from "../_shared/crypto.ts";
import {
  createInterHttpClient,
  decryptInterCredentials,
  getInterToken,
  registerBoleto,
  getBoletoDetails,
  getBoletoPdf,
  cancelBoleto,
  registerWebhook,
  type InterCredentials,
  type InterCobrancaRequest,
} from "../_shared/inter-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CERT_KEY = Deno.env.get("CERT_ENCRYPTION_KEY")!;

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const CORS = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const requestId = getRequestId(req);
  const log = (msg: string, ...args: unknown[]) =>
    console.log(`[inter-boleto][${requestId}] ${msg}`, ...args);

  try {
    // ── Auth ──
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) return json(401, { ok: false, error: "UNAUTHENTICATED" }, CORS);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: me } = await userClient.auth.getUser();
    if (!me?.user?.id) return json(401, { ok: false, error: "INVALID_TOKEN" }, CORS);

    const empresaId = req.headers.get("x-empresa-id");
    if (!empresaId) return json(400, { ok: false, error: "EMPRESA_HEADER_REQUIRED" }, CORS);

    // Check membership
    const { data: membership } = await svc
      .from("empresa_usuarios")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("user_id", me.user.id)
      .maybeSingle();
    if (!membership) return json(403, { ok: false, error: "NOT_A_MEMBER" }, CORS);

    // ── Parse action ──
    const body = req.method === "POST" ? await req.json() : {};
    const action = body.action || new URL(req.url).searchParams.get("action");

    log(`action=${action} empresa=${empresaId}`);

    // ── Save secrets (encrypt & store) ──
    if (action === "save-secrets") {
      return await handleSaveSecrets(svc, empresaId, body, CORS, log);
    }

    // ── Test connection ──
    if (action === "test") {
      return await handleTestConnection(svc, empresaId, CORS, log);
    }

    // ── Load Inter config ──
    const { data: config, error: cfgErr } = await svc
      .from("financeiro_inter_config")
      .select("*")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (cfgErr || !config) {
      return json(400, { ok: false, error: "INTER_NOT_CONFIGURED" }, CORS);
    }
    if (!config.client_id || !config.client_secret_encrypted || !config.cert_pem_encrypted || !config.key_pem_encrypted) {
      return json(400, { ok: false, error: "INTER_CREDENTIALS_INCOMPLETE" }, CORS);
    }

    // Decrypt credentials
    const creds = await decryptInterCredentials(
      { ...config, empresa_id: empresaId },
      CERT_KEY,
    );

    // Create mTLS client
    const httpClient = createInterHttpClient(creds);
    try {
      // Get OAuth token
      const tokenRes = await getInterToken(creds, httpClient);
      const accessToken = tokenRes.access_token;

      // Update last_token_at
      await svc
        .from("financeiro_inter_config")
        .update({ last_token_at: new Date().toISOString(), last_error: null })
        .eq("empresa_id", empresaId);

      // ── Route action ──
      switch (action) {
        case "register":
          return await handleRegister(svc, empresaId, accessToken, httpClient, creds, body, CORS, log);
        case "status":
          return await handleStatus(svc, empresaId, accessToken, httpClient, creds, body, CORS, log);
        case "pdf":
          return await handlePdf(accessToken, httpClient, creds, body, CORS, log);
        case "cancel":
          return await handleCancel(svc, empresaId, accessToken, httpClient, creds, body, CORS, log);
        case "register-webhook":
          return await handleRegisterWebhook(svc, empresaId, accessToken, httpClient, creds, body, CORS, log);
        default:
          return json(400, { ok: false, error: `UNKNOWN_ACTION: ${action}` }, CORS);
      }
    } finally {
      httpClient.close();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR:", msg);
    return json(500, { ok: false, error: msg }, CORS);
  }
});

// ── Handlers ─────────────────────────────────────────────

async function handleSaveSecrets(
  svc: ReturnType<typeof createClient>,
  empresaId: string,
  body: Record<string, unknown>,
  CORS: Record<string, string>,
  log: (...args: unknown[]) => void,
) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.client_secret) {
    updates.client_secret_encrypted = await aesGcmEncryptToString({
      masterKey: CERT_KEY,
      plaintext: String(body.client_secret),
      aad: empresaId,
    });
  }
  if (body.cert_pem) {
    updates.cert_pem_encrypted = await aesGcmEncryptToString({
      masterKey: CERT_KEY,
      plaintext: String(body.cert_pem),
      aad: empresaId,
    });
  }
  if (body.key_pem) {
    updates.key_pem_encrypted = await aesGcmEncryptToString({
      masterKey: CERT_KEY,
      plaintext: String(body.key_pem),
      aad: empresaId,
    });
  }

  // Ensure row exists first (upsert non-secret fields)
  await svc.from("financeiro_inter_config").upsert(
    { empresa_id: empresaId, ...updates },
    { onConflict: "empresa_id" },
  );

  log("Secrets saved for empresa:", empresaId);
  return json(200, { ok: true }, CORS);
}

async function handleTestConnection(
  svc: ReturnType<typeof createClient>,
  empresaId: string,
  CORS: Record<string, string>,
  log: (...args: unknown[]) => void,
) {
  const { data: config } = await svc
    .from("financeiro_inter_config")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (!config?.client_id || !config?.client_secret_encrypted || !config?.cert_pem_encrypted || !config?.key_pem_encrypted) {
    return json(200, { ok: false, error: "Credenciais incompletas. Configure Client ID, Secret e certificados." }, CORS);
  }

  let httpClient: Deno.HttpClient | null = null;
  try {
    const creds = await decryptInterCredentials(
      { ...config, empresa_id: empresaId },
      CERT_KEY,
    );
    httpClient = createInterHttpClient(creds);
    const tokenRes = await getInterToken(creds, httpClient);

    await svc
      .from("financeiro_inter_config")
      .update({ last_token_at: new Date().toISOString(), last_error: null })
      .eq("empresa_id", empresaId);

    log("Test connection OK — scopes:", tokenRes.scope);
    return json(200, {
      ok: true,
      scopes: tokenRes.scope,
      expires_in: tokenRes.expires_in,
    }, CORS);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await svc
      .from("financeiro_inter_config")
      .update({ last_error: msg })
      .eq("empresa_id", empresaId);
    log("Test connection FAILED:", msg);
    return json(200, { ok: false, error: msg }, CORS);
  } finally {
    httpClient?.close();
  }
}

async function handleRegister(
  svc: ReturnType<typeof createClient>,
  empresaId: string,
  accessToken: string,
  httpClient: Deno.HttpClient,
  creds: InterCredentials,
  body: Record<string, unknown>,
  CORS: Record<string, string>,
  log: (...args: unknown[]) => void,
) {
  const cobrancaId = String(body.cobranca_id || "");
  if (!cobrancaId) return json(400, { ok: false, error: "cobranca_id required" }, CORS);

  // Load cobrança
  const { data: cobranca } = await svc
    .from("financeiro_cobrancas_bancarias")
    .select("*, pessoas:cliente_id(nome, doc_unico, enderecos:pessoas_enderecos(logradouro, numero, complemento, bairro, cidade, uf, cep))")
    .eq("id", cobrancaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (!cobranca) return json(404, { ok: false, error: "COBRANCA_NOT_FOUND" }, CORS);

  // Build Inter payload
  const pessoa = cobranca.pessoas as any;
  const endereco = pessoa?.enderecos?.[0];
  const docUnico = (pessoa?.doc_unico || "").replace(/\D/g, "");

  const interPayload: InterCobrancaRequest = {
    seuNumero: cobranca.documento_ref || cobrancaId.slice(0, 15),
    valorNominal: Number(cobranca.valor_original || cobranca.valor_atual || 0),
    dataVencimento: cobranca.data_vencimento,
    numDiasAgenda: 60,
    pagador: {
      cpfCnpj: docUnico,
      tipoPessoa: docUnico.length > 11 ? "JURIDICA" : "FISICA",
      nome: pessoa?.nome || "Cliente",
      endereco: endereco?.logradouro || undefined,
      numero: endereco?.numero || undefined,
      complemento: endereco?.complemento || undefined,
      bairro: endereco?.bairro || undefined,
      cidade: endereco?.cidade || undefined,
      uf: endereco?.uf || undefined,
      cep: (endereco?.cep || "").replace(/\D/g, "") || undefined,
    },
    mensagem: cobranca.descricao
      ? { linha1: String(cobranca.descricao).slice(0, 78) }
      : undefined,
  };

  log("Registering boleto in Inter:", interPayload.seuNumero);

  // 1. Create cobrança in Inter
  const createRes = await registerBoleto(accessToken, httpClient, creds.ambiente, interPayload);
  const codigoSolicitacao = createRes.codigoSolicitacao;

  log("Inter codigoSolicitacao:", codigoSolicitacao);

  // 2. Fetch full details (nosso_numero, linhaDigitavel, codigoBarras)
  // Small delay — Inter may need a moment to process
  await new Promise((r) => setTimeout(r, 1500));

  const details = await getBoletoDetails(accessToken, httpClient, creds.ambiente, codigoSolicitacao);

  log("Inter details — nossoNumero:", details.nossoNumero, "situacao:", details.situacao);

  // 3. Update local record
  await svc
    .from("financeiro_cobrancas_bancarias")
    .update({
      provider: "inter",
      inter_codigo_solicitacao: codigoSolicitacao,
      inter_situacao: details.situacao,
      nosso_numero: details.nossoNumero,
      linha_digitavel: details.linhaDigitavel || null,
      codigo_barras: details.codigoBarras || null,
      status: "registrada",
      updated_at: new Date().toISOString(),
    })
    .eq("id", cobrancaId)
    .eq("empresa_id", empresaId);

  // 4. Log event
  await svc.from("financeiro_cobrancas_bancarias_eventos").insert({
    empresa_id: empresaId,
    cobranca_id: cobrancaId,
    tipo_evento: "inter_registro",
    status_anterior: cobranca.status,
    status_novo: "registrada",
    mensagem: `Boleto registrado no Banco Inter. Nosso Nº: ${details.nossoNumero}`,
    detalhe_tecnico: JSON.stringify({ codigoSolicitacao, situacao: details.situacao }),
  });

  return json(200, {
    ok: true,
    codigoSolicitacao,
    nossoNumero: details.nossoNumero,
    linhaDigitavel: details.linhaDigitavel,
    codigoBarras: details.codigoBarras,
    situacao: details.situacao,
  }, CORS);
}

async function handleStatus(
  svc: ReturnType<typeof createClient>,
  empresaId: string,
  accessToken: string,
  httpClient: Deno.HttpClient,
  creds: InterCredentials,
  body: Record<string, unknown>,
  CORS: Record<string, string>,
  log: (...args: unknown[]) => void,
) {
  const codigoSolicitacao = String(body.codigo_solicitacao || "");
  if (!codigoSolicitacao) return json(400, { ok: false, error: "codigo_solicitacao required" }, CORS);

  const details = await getBoletoDetails(accessToken, httpClient, creds.ambiente, codigoSolicitacao);

  // Update local
  await svc
    .from("financeiro_cobrancas_bancarias")
    .update({
      inter_situacao: details.situacao,
      updated_at: new Date().toISOString(),
    })
    .eq("inter_codigo_solicitacao", codigoSolicitacao)
    .eq("empresa_id", empresaId);

  log("Status query — situacao:", details.situacao);

  return json(200, { ok: true, ...details }, CORS);
}

async function handlePdf(
  accessToken: string,
  httpClient: Deno.HttpClient,
  creds: InterCredentials,
  body: Record<string, unknown>,
  CORS: Record<string, string>,
  log: (...args: unknown[]) => void,
) {
  const codigoSolicitacao = String(body.codigo_solicitacao || "");
  if (!codigoSolicitacao) return json(400, { ok: false, error: "codigo_solicitacao required" }, CORS);

  log("Downloading PDF for:", codigoSolicitacao);
  const pdfBase64 = await getBoletoPdf(accessToken, httpClient, creds.ambiente, codigoSolicitacao);

  return json(200, { ok: true, pdf: pdfBase64 }, CORS);
}

async function handleCancel(
  svc: ReturnType<typeof createClient>,
  empresaId: string,
  accessToken: string,
  httpClient: Deno.HttpClient,
  creds: InterCredentials,
  body: Record<string, unknown>,
  CORS: Record<string, string>,
  log: (...args: unknown[]) => void,
) {
  const codigoSolicitacao = String(body.codigo_solicitacao || "");
  const motivo = String(body.motivo || "Cancelado pelo ERP");
  if (!codigoSolicitacao) return json(400, { ok: false, error: "codigo_solicitacao required" }, CORS);

  await cancelBoleto(accessToken, httpClient, creds.ambiente, codigoSolicitacao, motivo);

  // Update local
  await svc
    .from("financeiro_cobrancas_bancarias")
    .update({
      status: "cancelada",
      inter_situacao: "CANCELADO",
      updated_at: new Date().toISOString(),
    })
    .eq("inter_codigo_solicitacao", codigoSolicitacao)
    .eq("empresa_id", empresaId);

  log("Boleto cancelled:", codigoSolicitacao);
  return json(200, { ok: true }, CORS);
}

async function handleRegisterWebhook(
  svc: ReturnType<typeof createClient>,
  empresaId: string,
  accessToken: string,
  httpClient: Deno.HttpClient,
  creds: InterCredentials,
  body: Record<string, unknown>,
  CORS: Record<string, string>,
  log: (...args: unknown[]) => void,
) {
  const webhookUrl = String(body.webhook_url || "");
  if (!webhookUrl) return json(400, { ok: false, error: "webhook_url required" }, CORS);

  await registerWebhook(accessToken, httpClient, creds.ambiente, webhookUrl);

  await svc
    .from("financeiro_inter_config")
    .update({ webhook_registered: true, webhook_url: webhookUrl })
    .eq("empresa_id", empresaId);

  log("Webhook registered:", webhookUrl);
  return json(200, { ok: true }, CORS);
}
