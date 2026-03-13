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

  const { nfse_id } = body;
  if (!nfse_id) {
    return json(400, { ok: false, error: "MISSING_NFSE_ID" }, cors);
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
    // Read NFS-e draft
    const { data: nfse } = await admin
      .from("fiscal_nfse_emissoes")
      .select("*")
      .eq("id", nfse_id)
      .eq("empresa_id", empresaId)
      .single();
    if (!nfse) {
      return json(404, { ok: false, error: "NFSE_NOT_FOUND" }, cors);
    }
    if (!["rascunho", "erro", "rejeitada"].includes(nfse.status)) {
      return json(409, { ok: false, error: "INVALID_STATUS" }, cors);
    }

    // Read emitente
    const { data: emitente } = await admin
      .from("fiscal_nfe_emitente")
      .select("*")
      .eq("empresa_id", empresaId)
      .single();
    if (!emitente) {
      return json(422, { ok: false, error: "EMITENTE_NOT_CONFIGURED" }, cors);
    }

    // Read tomador (client)
    let tomador: any = {};
    if (nfse.tomador_pessoa_id) {
      const { data: pessoa } = await admin
        .from("pessoas")
        .select("*")
        .eq("id", nfse.tomador_pessoa_id)
        .eq("empresa_id", empresaId)
        .single();
      if (pessoa) {
        const { data: endereco } = await admin
          .from("pessoa_enderecos")
          .select("*")
          .eq("pessoa_id", nfse.tomador_pessoa_id)
          .eq("empresa_id", empresaId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const cpfCnpj = (pessoa.doc_unico || "").replace(/\D/g, "");
        tomador = {
          ...(cpfCnpj.length === 14 ? { cnpj: cpfCnpj } : { cpf: cpfCnpj }),
          razao_social: pessoa.nome || pessoa.razao_social || "",
          email: pessoa.email || "",
          telefone: (pessoa.telefone || "").replace(/\D/g, ""),
          inscricao_municipal: pessoa.inscr_municipal || "",
          logradouro: endereco?.logradouro || "",
          numero: endereco?.numero || "S/N",
          complemento: endereco?.complemento || "",
          bairro: endereco?.bairro || "",
          codigo_municipio: endereco?.cidade_codigo || "",
          uf: endereco?.uf || "",
          cep: (endereco?.cep || "").replace(/\D/g, ""),
        };
      }
    }

    // Determine ambiente
    const { data: config } = await admin
      .from("fiscal_nfe_emissao_config")
      .select("ambiente")
      .eq("empresa_id", empresaId)
      .eq("provider_slug", "FOCUSNFE")
      .maybeSingle();
    const ambiente = config?.ambiente || "homologacao";
    const apiToken = await getCompanyApiToken(admin, empresaId, ambiente);
    if (!apiToken) return json(500, { ok: false, error: "MISSING_API_TOKEN" }, cors);

    // Build NFS-e payload for Focus NFe
    const nfsePayload: Record<string, any> = {
      // Prestador (emitente)
      razao_social: emitente.razao_social,
      cnpj: (emitente.cnpj || "").replace(/\D/g, ""),
      inscricao_municipal: emitente.im || "",
      codigo_municipio: emitente.endereco_municipio_codigo || nfse.codigo_municipio || "",

      // Serviço
      discriminacao: nfse.discriminacao || "",
      valor_servicos: Number(nfse.valor_servicos || 0),
      iss_retido: nfse.iss_retido ? "1" : "2",
      item_lista_servico: nfse.item_lista_servico || "",
      aliquota: Number(nfse.aliquota_iss || 0),
      natureza_operacao: nfse.natureza_operacao || "1",

      // Tomador
      ...(Object.keys(tomador).length > 0 ? { tomador } : {}),
    };

    if (nfse.valor_deducoes && Number(nfse.valor_deducoes) > 0) {
      nfsePayload.valor_deducoes = Number(nfse.valor_deducoes);
    }

    const ref = nfse_id;
    const baseUrl = getFocusBaseUrl(ambiente);
    const url = `${baseUrl}/v2/nfse?ref=${ref}`;

    // Update status to processando
    await admin
      .from("fiscal_nfse_emissoes")
      .update({
        status: "processando",
        ambiente,
        focusnfe_ref: ref,
        last_error: null,
        payload: nfsePayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", nfse_id);

    // Log submission
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      provider: "focusnfe",
      level: "info",
      message: `Submitting NFS-e to Focus (${ambiente})`,
      payload: { url, ref, request_id: requestId },
    }).then(null, () => {});

    // Call Focus NFe
    const { response, data } = await focusFetch(url, {
      method: "POST",
      token: apiToken,
      body: JSON.stringify(nfsePayload),
    });

    // Log response
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      provider: "focusnfe",
      level: response.ok ? "info" : "error",
      message: `Focus NFS-e response: ${response.status}`,
      payload: { status: response.status, body: data, request_id: requestId },
    }).then(null, () => {});

    if (response.ok) {
      const focusStatus = data?.status || "";
      if (focusStatus === "autorizado") {
        await admin.from("fiscal_nfse_emissoes").update({
          status: "autorizada",
          numero: data?.numero || null,
          codigo_verificacao: data?.codigo_verificacao || null,
          url_nota: data?.url || null,
          pdf_url: data?.caminho_xml_nota_fiscal // Focus sometimes returns URLs here
            ? null : null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", nfse_id);
      } else if (focusStatus === "erro_autorizacao") {
        await admin.from("fiscal_nfse_emissoes").update({
          status: "rejeitada",
          last_error: data?.mensagem || JSON.stringify(data),
          updated_at: new Date().toISOString(),
        }).eq("id", nfse_id);
      }
      // else: still processing, webhook will update

      return json(200, { ok: true, status: focusStatus || "processando", ref }, cors);
    } else {
      const errorMsg = data?.mensagem || `HTTP ${response.status}`;
      await admin.from("fiscal_nfse_emissoes").update({
        status: "erro",
        last_error: errorMsg,
        updated_at: new Date().toISOString(),
      }).eq("id", nfse_id);

      return json(response.status >= 500 ? 502 : 422, {
        ok: false, error: "FOCUS_API_ERROR", detail: errorMsg,
      }, cors);
    }
  } catch (err: any) {
    await admin.from("fiscal_nfse_emissoes").update({
      status: "erro",
      last_error: err?.message || "Unexpected error",
      updated_at: new Date().toISOString(),
    }).eq("id", nfse_id).then(null, () => {});

    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
