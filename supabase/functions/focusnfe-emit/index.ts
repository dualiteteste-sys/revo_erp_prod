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

// ---------------------------------------------------------------------------
// Focus NFe API helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Data mappers: internal schema -> Focus NFe API format
// ---------------------------------------------------------------------------

function mapCrt(crt: number): string {
  // 1 = Simples Nacional, 2 = SN excesso sublimite, 3 = Regime Normal
  return String(crt || 1);
}

function buildFocusPayload(
  emitente: any,
  dest: any,
  emissao: any,
  itens: any[],
): Record<string, any> {
  const now = new Date().toISOString();

  const payload: Record<string, any> = {
    // Emitente
    cnpj_emitente: emitente.cnpj,
    nome_emitente: emitente.razao_social,
    nome_fantasia_emitente: emitente.nome_fantasia || emitente.razao_social,
    inscricao_estadual_emitente: emitente.ie || "",
    logradouro_emitente: emitente.endereco_logradouro || "",
    numero_emitente: emitente.endereco_numero || "S/N",
    complemento_emitente: emitente.endereco_complemento || "",
    bairro_emitente: emitente.endereco_bairro || "",
    municipio_emitente: emitente.endereco_municipio || "",
    uf_emitente: emitente.endereco_uf || "",
    cep_emitente: (emitente.endereco_cep || "").replace(/\D/g, ""),
    codigo_municipio_emitente: emitente.endereco_municipio_codigo || "",
    regime_tributario_emitente: mapCrt(emitente.crt),

    // Destinatario
    nome_destinatario: dest.nome || dest.razao_social || "",
    logradouro_destinatario: dest.endereco_logradouro || dest.logradouro || "",
    numero_destinatario: dest.endereco_numero || dest.numero || "S/N",
    complemento_destinatario: dest.endereco_complemento || dest.complemento || "",
    bairro_destinatario: dest.endereco_bairro || dest.bairro || "",
    municipio_destinatario: dest.endereco_municipio || dest.municipio || "",
    uf_destinatario: dest.endereco_uf || dest.uf || "",
    cep_destinatario: (dest.endereco_cep || dest.cep || "").replace(/\D/g, ""),

    // Operacao
    natureza_operacao: emissao.natureza_operacao || "Venda de mercadoria",
    data_emissao: now,
    tipo_documento: "1", // 1 = saida
    finalidade_emissao: "1", // 1 = normal
    local_destino: "1", // 1 = operacao interna
    presenca_comprador: "9", // 9 = nao se aplica (online)

    // Frete
    modalidade_frete: "9", // 9 = sem frete
    valor_frete: emissao.total_frete || 0,

    // Totais
    valor_produtos: emissao.total_produtos || 0,
    valor_total: emissao.valor_total || emissao.total_nfe || 0,
    valor_desconto: emissao.total_descontos || 0,

    // Forma de pagamento
    formas_pagamento: [{
      forma_pagamento: "99", // 99 = outros
      valor_pagamento: emissao.valor_total || emissao.total_nfe || 0,
    }],

    // Items
    items: itens.map((item, idx) => {
      const itemPayload: Record<string, any> = {
        numero_item: String(idx + 1),
        codigo_produto: item.produto_id || String(idx + 1),
        descricao: item.descricao || "Produto",
        unidade_comercial: item.unidade || "UN",
        quantidade_comercial: String(item.quantidade || 1),
        valor_unitario_comercial: String(item.valor_unitario || 0),
        unidade_tributavel: item.unidade || "UN",
        quantidade_tributavel: String(item.quantidade || 1),
        valor_unitario_tributavel: String(item.valor_unitario || 0),
        codigo_ncm: (item.ncm || "00000000").replace(/\D/g, ""),
        valor_bruto: String((item.quantidade || 0) * (item.valor_unitario || 0)),
        icms_origem: "0", // 0 = nacional
      };

      // CFOP
      if (item.cfop) {
        itemPayload.cfop = item.cfop;
      }

      // Desconto
      if (item.valor_desconto && item.valor_desconto > 0) {
        itemPayload.valor_desconto = String(item.valor_desconto);
      }

      // Tributacao: Simples Nacional usa CSOSN, Regime Normal usa CST
      if (item.csosn) {
        itemPayload.icms_situacao_tributaria = item.csosn;
      } else if (item.cst) {
        itemPayload.icms_situacao_tributaria = item.cst;
      } else {
        // Fallback Simples Nacional: 102 = tributada sem ST
        itemPayload.icms_situacao_tributaria = "102";
      }

      // PIS/COFINS: para SN geralmente 99
      itemPayload.pis_situacao_tributaria = "99";
      itemPayload.pis_aliquota_porcentual = "0";
      itemPayload.cofins_situacao_tributaria = "99";
      itemPayload.cofins_aliquota_porcentual = "0";

      return itemPayload;
    }),
  };

  // Destinatario CPF ou CNPJ
  const cpfCnpj = (dest.cpf || dest.cnpj || dest.cpf_cnpj || "").replace(/\D/g, "");
  if (cpfCnpj.length === 14) {
    payload.cnpj_destinatario = cpfCnpj;
    payload.indicador_inscricao_estadual_destinatario = "1"; // contribuinte
    payload.inscricao_estadual_destinatario = dest.ie || dest.inscricao_estadual || "";
  } else if (cpfCnpj.length === 11) {
    payload.cpf_destinatario = cpfCnpj;
    payload.indicador_inscricao_estadual_destinatario = "9"; // nao contribuinte
  }

  // UF destino = mesmo que emitente -> operacao interna
  if (
    payload.uf_destinatario &&
    payload.uf_emitente &&
    payload.uf_destinatario !== payload.uf_emitente
  ) {
    payload.local_destino = "2"; // interestadual
  }

  if (emissao.total_frete && emissao.total_frete > 0) {
    payload.modalidade_frete = "1"; // 1 = emitente
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);
  }

  // Auth: requires valid Supabase JWT
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

  // Create user client (respects RLS) and admin client (bypasses RLS)
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Get current user
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json(401, { ok: false, error: "INVALID_TOKEN" }, cors);
  }

  // Get empresa_id from header
  const empresaId = req.headers.get("x-empresa-id") || "";
  if (!empresaId) {
    return json(400, { ok: false, error: "MISSING_EMPRESA_ID" }, cors);
  }

  // Verify membership
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
    // 1. Read emissao
    const { data: emissao, error: emissaoErr } = await admin
      .from("fiscal_nfe_emissoes")
      .select("*")
      .eq("id", emissao_id)
      .eq("empresa_id", empresaId)
      .single();
    if (emissaoErr || !emissao) {
      return json(404, { ok: false, error: "EMISSAO_NOT_FOUND" }, cors);
    }

    // Only allow submitting rascunho or erro (retry)
    if (!["rascunho", "erro", "rejeitada"].includes(emissao.status)) {
      return json(
        409,
        { ok: false, error: "INVALID_STATUS", detail: `Cannot submit status=${emissao.status}` },
        cors,
      );
    }

    // 2. Read emitente
    const { data: emitente } = await admin
      .from("fiscal_nfe_emitente")
      .select("*")
      .eq("empresa_id", empresaId)
      .single();
    if (!emitente) {
      return json(422, { ok: false, error: "EMITENTE_NOT_CONFIGURED" }, cors);
    }

    // 3. Read destinatario (pessoa)
    const { data: destPessoa } = await admin
      .from("pessoas")
      .select("*")
      .eq("id", emissao.destinatario_pessoa_id)
      .eq("empresa_id", empresaId)
      .single();
    if (!destPessoa) {
      return json(422, { ok: false, error: "DESTINATARIO_NOT_FOUND" }, cors);
    }

    // Also try to get fiscal data
    const { data: destFiscal } = await admin
      .from("fiscal_nfe_cliente_cadastro")
      .select("*")
      .eq("pessoa_id", emissao.destinatario_pessoa_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const dest = { ...destPessoa, ...(destFiscal || {}) };

    // 4. Read items
    const { data: itens } = await admin
      .from("fiscal_nfe_emissao_itens")
      .select("*")
      .eq("emissao_id", emissao_id)
      .eq("empresa_id", empresaId)
      .order("ordem", { ascending: true });
    if (!itens || itens.length === 0) {
      return json(422, { ok: false, error: "NO_ITEMS" }, cors);
    }

    // 5. Determine ambiente
    const ambiente = emissao.ambiente || "homologacao";
    const apiToken = getFocusApiToken(ambiente);
    if (!apiToken) {
      return json(500, { ok: false, error: "MISSING_API_TOKEN", detail: `Token for ${ambiente} not configured` }, cors);
    }

    // 6. Build Focus NFe payload
    const focusPayload = buildFocusPayload(emitente, dest, emissao, itens);

    // 7. Generate idempotency ref (use emissao UUID)
    const ref = emissao_id;
    const baseUrl = getFocusBaseUrl(ambiente);
    const url = `${baseUrl}/v2/nfe?ref=${ref}`;

    // 8. Update status to 'processando'
    await admin
      .from("fiscal_nfe_emissoes")
      .update({ status: "processando", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", emissao_id);

    // Log the submission
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: "info",
      message: `Submitting NFe to Focus (${ambiente})`,
      payload: { url, ref, request_id: requestId },
    });

    // 9. Call Focus NFe API
    const focusResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": basicAuth(apiToken),
      },
      body: JSON.stringify(focusPayload),
    });

    const focusBody = await focusResponse.text();
    let focusData: any;
    try {
      focusData = JSON.parse(focusBody);
    } catch {
      focusData = { raw: focusBody };
    }

    // Log the response
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: focusResponse.ok ? "info" : "error",
      message: `Focus response: ${focusResponse.status}`,
      payload: { status: focusResponse.status, body: focusData, request_id: requestId },
    });

    // 10. Create/update provider link
    await admin.from("fiscal_nfe_nfeio_emissoes").upsert(
      {
        empresa_id: empresaId,
        emissao_id,
        ambiente,
        nfeio_id: ref,
        idempotency_key: ref,
        provider_status: focusData?.status || "submitted",
        request_payload: focusPayload,
        response_payload: focusData,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "emissao_id" },
    );

    // 11. Update emissao status based on Focus response
    if (focusResponse.ok) {
      const focusStatus = focusData?.status || "";

      if (focusStatus === "autorizado") {
        // Immediate authorization (rare but possible)
        await admin.from("fiscal_nfe_emissoes").update({
          status: "autorizada",
          chave_acesso: focusData?.chave_nfe || null,
          numero: focusData?.numero ? parseInt(focusData.numero) : null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", emissao_id);
      } else if (focusStatus === "erro_autorizacao" || focusStatus === "rejeitado") {
        await admin.from("fiscal_nfe_emissoes").update({
          status: "rejeitada",
          last_error: focusData?.mensagem || focusData?.mensagem_sefaz || JSON.stringify(focusData),
          updated_at: new Date().toISOString(),
        }).eq("id", emissao_id);
      } else {
        // Still processing (processando_autorizacao)
        await admin.from("fiscal_nfe_emissoes").update({
          status: "processando",
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", emissao_id);
      }

      return json(200, {
        ok: true,
        status: focusStatus || "processando",
        focus_response: focusData,
        ref,
      }, cors);
    } else {
      // API error
      const errorMsg = focusData?.mensagem || focusData?.message || `HTTP ${focusResponse.status}`;
      await admin.from("fiscal_nfe_emissoes").update({
        status: "erro",
        last_error: errorMsg,
        updated_at: new Date().toISOString(),
      }).eq("id", emissao_id);

      return json(focusResponse.status >= 500 ? 502 : 422, {
        ok: false,
        error: "FOCUS_API_ERROR",
        detail: errorMsg,
        focus_response: focusData,
      }, cors);
    }
  } catch (err: any) {
    // Unexpected error
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: "error",
      message: `Unexpected error: ${err?.message || String(err)}`,
      payload: { stack: err?.stack, request_id: requestId },
    }).catch(() => {});

    await admin.from("fiscal_nfe_emissoes").update({
      status: "erro",
      last_error: err?.message || "Unexpected error",
      updated_at: new Date().toISOString(),
    }).eq("id", emissao_id).catch(() => {});

    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
