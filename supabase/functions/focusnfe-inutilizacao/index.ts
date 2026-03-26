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

  const { serie, numero_inicial, numero_final, justificativa } = body;

  // Validate inputs
  if (serie == null || numero_inicial == null || numero_final == null) {
    return json(400, {
      ok: false,
      error: "MISSING_FIELDS",
      detail: "Campos obrigatórios: serie, numero_inicial, numero_final.",
    }, cors);
  }
  if (!justificativa || justificativa.trim().length < 15) {
    return json(400, {
      ok: false,
      error: "JUSTIFICATIVA_REQUIRED",
      detail: "Justificativa deve ter no mínimo 15 caracteres.",
    }, cors);
  }
  if (numero_final < numero_inicial) {
    return json(400, {
      ok: false,
      error: "INVALID_RANGE",
      detail: "Número final deve ser maior ou igual ao número inicial.",
    }, cors);
  }
  if (numero_final - numero_inicial + 1 > 10000) {
    return json(400, {
      ok: false,
      error: "RANGE_TOO_LARGE",
      detail: "Máximo de 10.000 números por solicitação.",
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
    // Determine ambiente from emitente config
    const { data: emitente } = await admin
      .from("fiscal_nfe_emitente")
      .select("ambiente")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const ambiente = emitente?.ambiente || "homologacao";
    const apiToken = await getCompanyApiToken(admin, empresaId, ambiente);
    if (!apiToken) return json(500, { ok: false, error: "MISSING_API_TOKEN" }, cors);

    const baseUrl = getFocusBaseUrl(ambiente);

    // Call Focus NFe inutilizacao API
    const { response, data } = await focusFetch(
      `${baseUrl}/v2/nfe/inutilizacao`,
      {
        method: "POST",
        token: apiToken,
        body: JSON.stringify({
          serie: Number(serie),
          numero_inicial: Number(numero_inicial),
          numero_final: Number(numero_final),
          justificativa: justificativa.trim(),
        }),
      },
    );

    // Log
    try {
      await admin.from("fiscal_nfe_provider_logs").insert({
        empresa_id: empresaId,
        emissao_id: null,
        provider: "focusnfe",
        level: response.ok ? "info" : "error",
        message: `NF-e inutilizacao: ${response.status}`,
        payload: {
          serie,
          numero_inicial,
          numero_final,
          status: response.status,
          body: data,
          request_id: requestId,
        },
      });
    } catch { /* ignore log failures */ }

    // Determine status from Focus response
    const statusSefaz = data?.status_sefaz || data?.status || "";
    const mensagemSefaz = data?.mensagem_sefaz || data?.mensagem || "";
    const xmlUrl = data?.caminho_xml_inutilizacao || null;

    // Success: status_sefaz contains "102" (homologada) or "206"/"562" (already inutilized)
    const isSuccess = response.ok ||
      statusSefaz.includes("102") ||
      statusSefaz.includes("206") ||
      statusSefaz.includes("562");

    const recordStatus = isSuccess ? "autorizada" : "erro";

    // Insert record in inutilizacoes table
    await admin.from("fiscal_nfe_inutilizacoes").insert({
      empresa_id: empresaId,
      ambiente,
      serie: Number(serie),
      numero_inicial: Number(numero_inicial),
      numero_final: Number(numero_final),
      justificativa: justificativa.trim(),
      status: recordStatus,
      status_sefaz: statusSefaz,
      mensagem_sefaz: mensagemSefaz,
      protocolo: data?.protocolo || null,
      xml_url: xmlUrl,
    });

    if (isSuccess) {
      return json(200, {
        ok: true,
        status_sefaz: statusSefaz,
        mensagem_sefaz: mensagemSefaz,
        protocolo: data?.protocolo || null,
      }, cors);
    } else {
      return json(422, {
        ok: false,
        error: "INUTILIZACAO_FAILED",
        status_sefaz: statusSefaz,
        mensagem_sefaz: mensagemSefaz,
        detail: mensagemSefaz || `HTTP ${response.status}`,
      }, cors);
    }
  } catch (err: any) {
    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
