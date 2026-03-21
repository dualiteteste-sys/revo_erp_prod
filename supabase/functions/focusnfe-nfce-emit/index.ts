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
// Rejection code parser
// ---------------------------------------------------------------------------

function parseRejectionCode(mensagem: string | null | undefined): string | null {
  if (!mensagem) return null;
  const m = mensagem.match(/Rejei[çc][aã]o:?\s*(\d{3,4})/i);
  return m ? m[1] : null;
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

async function getCompanyApiToken(admin: any, empresaId: string, ambiente: string): Promise<string> {
  const { data } = await admin
    .from("fiscal_nfe_emitente")
    .select("focusnfe_token_producao, focusnfe_token_homologacao")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const companyToken = ambiente === "producao"
    ? data?.focusnfe_token_producao
    : data?.focusnfe_token_homologacao;
  return (companyToken || "").trim() || getFocusApiToken(ambiente);
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
// Data mappers
// ---------------------------------------------------------------------------

function mapCrt(crt: number): string {
  return String(crt || 1);
}

// SEFAZ payment codes — maps display names to tPag codes
const FORMA_PAGAMENTO_MAP: Record<string, string> = {
  "dinheiro": "01",
  "cheque": "02",
  "cartao de credito": "03",
  "cartao credito": "03",
  "cartao_credito": "03",
  "cartao de debito": "04",
  "cartao debito": "04",
  "cartao_debito": "04",
  "credito loja": "05",
  "credito_loja": "05",
  "vale alimentacao": "10",
  "vale_alimentacao": "10",
  "vale refeicao": "11",
  "vale_refeicao": "11",
  "vale presente": "12",
  "vale_presente": "12",
  "vale combustivel": "13",
  "vale_combustivel": "13",
  "boleto": "15",
  "deposito": "16",
  "pix": "17",
  "transferencia": "18",
  "ted/doc": "18",
  "sem pagamento": "90",
  "sem_pagamento": "90",
  "outros": "99",
};

function mapFormaPagamento(forma: string | null | undefined): string {
  if (!forma) return "99";
  // Try both the raw value and a normalized version (lowercase, remove accents)
  const lower = forma.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return FORMA_PAGAMENTO_MAP[lower] || forma.replace(/\D/g, "") || "99";
}

// ---------------------------------------------------------------------------
// NFC-e payload builder (simplified from NF-e — no transport, no duplicatas)
// ---------------------------------------------------------------------------

function buildNfcePayload(
  emitente: any,
  dest: any | null,
  emissao: any,
  itens: any[],
  pagamentos: any[],
): Record<string, any> {
  const now = new Date().toISOString();
  const crt = emitente.crt || 1;
  const isRegimeNormal = crt === 3;

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
    regime_tributario_emitente: mapCrt(crt),

    // NFC-e specifics
    natureza_operacao: "Venda",
    data_emissao: now,
    tipo_documento: "1",
    finalidade_emissao: "1",
    local_destino: "1",
    presenca_comprador: "1", // presencial (PDV)
    consumidor_final: "1",   // always consumer
    modalidade_frete: "9",   // always sem frete

    // Totais
    valor_produtos: emissao.total_produtos || 0,
    valor_total: emissao.valor_total || emissao.total_nfe || 0,
    valor_desconto: emissao.total_descontos || 0,
    valor_frete: 0,

    // Formas de pagamento (from vendas_pdv_pagamentos)
    formas_pagamento: pagamentos.length > 0
      ? pagamentos.map((p: any) => {
          const sefazCode = p.forma_pagamento_sefaz || mapFormaPagamento(p.forma_pagamento);
          return {
            forma_pagamento: sefazCode,
            valor_pagamento: p.valor || 0,
          };
        })
      : [{
          forma_pagamento: mapFormaPagamento(emissao.forma_pagamento),
          valor_pagamento: emissao.valor_total || emissao.total_nfe || 0,
        }],

    // Items
    items: itens.map((item, idx) => {
      const impostos = item.impostos && typeof item.impostos === "object" && Object.keys(item.impostos).length > 0
        ? item.impostos
        : null;

      const normCst = (v: string) => v.replace(/^0(\d{2})$/, "$1");

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
        icms_origem: impostos?.icms?.origem || "0",
      };

      // CFOP — NFC-e always starts with 5 (intra-state)
      const cfop = item.cfop || "5102";
      itemPayload.cfop = cfop.startsWith("5") ? cfop : "5102";

      // Desconto
      if (item.valor_desconto && item.valor_desconto > 0) {
        itemPayload.valor_desconto = String(item.valor_desconto);
      }

      // --- ICMS ---
      if (impostos?.icms) {
        const icms = impostos.icms;
        if (isRegimeNormal && icms.cst) {
          itemPayload.icms_situacao_tributaria = normCst(icms.cst);
          if (icms.base_calculo != null) {
            itemPayload.icms_modalidade_base_calculo = String(icms.modalidade_base_calculo ?? 3);
            itemPayload.icms_base_calculo = String(icms.base_calculo);
          }
          if (icms.aliquota != null && icms.aliquota > 0) itemPayload.icms_aliquota = String(icms.aliquota);
          if (icms.valor != null && icms.valor > 0) itemPayload.icms_valor = String(icms.valor);
        } else if (icms.csosn) {
          itemPayload.icms_situacao_tributaria = icms.csosn;
        } else {
          itemPayload.icms_situacao_tributaria = icms.cst || "102";
        }
      } else {
        if (item.csosn) {
          itemPayload.icms_situacao_tributaria = item.csosn;
        } else if (item.cst) {
          itemPayload.icms_situacao_tributaria = normCst(item.cst);
        } else {
          itemPayload.icms_situacao_tributaria = "102";
        }
      }

      // --- PIS ---
      if (impostos?.pis) {
        const pis = impostos.pis;
        itemPayload.pis_situacao_tributaria = pis.cst || "99";
        if (pis.base_calculo != null) itemPayload.pis_base_calculo = String(pis.base_calculo);
        if (pis.aliquota != null && pis.aliquota > 0) itemPayload.pis_aliquota_porcentual = String(pis.aliquota);
        if (pis.valor != null && pis.valor > 0) itemPayload.pis_valor = String(pis.valor);
      } else {
        itemPayload.pis_situacao_tributaria = "99";
        itemPayload.pis_aliquota_porcentual = "0";
      }

      // --- COFINS ---
      if (impostos?.cofins) {
        const cofins = impostos.cofins;
        itemPayload.cofins_situacao_tributaria = cofins.cst || "99";
        if (cofins.base_calculo != null) itemPayload.cofins_base_calculo = String(cofins.base_calculo);
        if (cofins.aliquota != null && cofins.aliquota > 0) itemPayload.cofins_aliquota_porcentual = String(cofins.aliquota);
        if (cofins.valor != null && cofins.valor > 0) itemPayload.cofins_valor = String(cofins.valor);
      } else {
        itemPayload.cofins_situacao_tributaria = "99";
        itemPayload.cofins_aliquota_porcentual = "0";
      }

      // --- cBenef ---
      {
        const cBenef = (item.codigo_beneficio_fiscal || impostos?.icms?.codigo_beneficio_fiscal || "").trim();
        if (cBenef) itemPayload.codigo_beneficio_fiscal = cBenef;
      }

      return itemPayload;
    }),
  };

  // Troco: if cash payment has change, add troco to formas_pagamento
  const totalTroco = pagamentos.reduce((acc: number, p: any) => acc + (p.troco || 0), 0);
  if (totalTroco > 0) {
    payload.troco = totalTroco;
  }

  // Destinatario (optional for NFC-e — only include if CPF/CNPJ is available)
  if (dest) {
    const cpfCnpj = (dest.cpf_cnpj || dest.doc_unico || "").replace(/\D/g, "");
    if (cpfCnpj.length === 11) {
      payload.cpf_destinatario = cpfCnpj;
      payload.nome_destinatario = dest.nome || "";
      payload.indicador_inscricao_estadual_destinatario = "9";
    } else if (cpfCnpj.length === 14) {
      payload.cnpj_destinatario = cpfCnpj;
      payload.nome_destinatario = dest.nome || dest.razao_social || "";
      payload.indicador_inscricao_estadual_destinatario = "9";
    }
    // For NFC-e, address is NOT required even when CPF/CNPJ is present
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

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json(401, { ok: false, error: "INVALID_TOKEN" }, cors);
  }

  const empresaId = req.headers.get("x-empresa-id") || "";
  if (!empresaId) {
    return json(400, { ok: false, error: "MISSING_EMPRESA_ID" }, cors);
  }

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

    if (emissao.modelo !== "65") {
      return json(422, { ok: false, error: "NOT_NFCE", detail: "Esta emissao nao e modelo 65 (NFC-e)." }, cors);
    }

    if (!["rascunho", "erro", "rejeitada"].includes(emissao.status)) {
      return json(409, {
        ok: false,
        error: "INVALID_STATUS",
        detail: `Cannot submit status=${emissao.status}`,
      }, cors);
    }

    // 2. Read emitente
    const { data: emitente, error: emitErr } = await admin
      .from("fiscal_nfe_emitente")
      .select("*")
      .eq("empresa_id", empresaId.trim())
      .single();
    if (emitErr || !emitente) {
      try {
        await admin.from("fiscal_nfe_provider_logs").insert({
          empresa_id: empresaId,
          emissao_id,
          provider: "focusnfe",
          level: "error",
          message: `EMITENTE_NOT_CONFIGURED: ${emitErr?.message || "row not found"}`,
          payload: { error_code: emitErr?.code, request_id: requestId },
        });
      } catch { /* ignore */ }
      return json(422, {
        ok: false,
        error: "EMITENTE_NOT_CONFIGURED",
        detail: "Acesse Fiscal > Configuracoes e preencha os dados do emitente.",
      }, cors);
    }

    // Validate CSC
    if (!emitente.csc || emitente.csc.trim() === "") {
      return json(422, {
        ok: false,
        error: "CSC_NOT_CONFIGURED",
        detail: "CSC para NFC-e nao configurado. Configure em Fiscal > Configuracoes.",
      }, cors);
    }

    // Fallback: enrich with empresas data
    const { data: empresa } = await admin
      .from("empresas")
      .select("cnpj, nome_razao_social, nome_fantasia, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf")
      .eq("id", emitente.empresa_id)
      .single();

    const emitenteFull = {
      ...emitente,
      cnpj: emitente.cnpj || empresa?.cnpj || "",
      razao_social: emitente.razao_social || empresa?.nome_razao_social || "",
      nome_fantasia: emitente.nome_fantasia || empresa?.nome_fantasia || "",
      endereco_logradouro: emitente.endereco_logradouro || empresa?.endereco_logradouro || "",
      endereco_numero: emitente.endereco_numero || empresa?.endereco_numero || "S/N",
      endereco_complemento: emitente.endereco_complemento || empresa?.endereco_complemento || "",
      endereco_bairro: emitente.endereco_bairro || empresa?.endereco_bairro || "",
      endereco_municipio: emitente.endereco_municipio || empresa?.endereco_cidade || "",
      endereco_uf: emitente.endereco_uf || empresa?.endereco_uf || "",
      endereco_cep: emitente.endereco_cep || empresa?.endereco_cep || "",
    };

    // 3. Read destinatario (optional for NFC-e)
    let dest: any = null;
    if (emissao.destinatario_pessoa_id) {
      const { data: destPessoa } = await admin
        .from("pessoas")
        .select("*")
        .eq("id", emissao.destinatario_pessoa_id)
        .eq("empresa_id", empresaId)
        .single();
      if (destPessoa) {
        dest = {
          ...destPessoa,
          cpf_cnpj: destPessoa.doc_unico || "",
        };
      }
    }

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

    // 5. Read payment methods from vendas_pdv_pagamentos
    let pagamentos: any[] = [];
    if (emissao.pedido_origem_id) {
      const { data: pags } = await admin
        .from("vendas_pdv_pagamentos")
        .select("forma_pagamento, forma_pagamento_sefaz, valor, troco")
        .eq("pedido_id", emissao.pedido_origem_id)
        .eq("empresa_id", empresaId);
      pagamentos = pags || [];
    }

    // 6. Determine ambiente + token
    const ambiente = emissao.ambiente || "homologacao";
    const apiToken = await getCompanyApiToken(admin, empresaId, ambiente);
    if (!apiToken) {
      return json(500, { ok: false, error: "MISSING_API_TOKEN", detail: `Token for ${ambiente} not configured` }, cors);
    }

    // 7. Build NFC-e payload
    const focusPayload = buildNfcePayload(emitenteFull, dest, emissao, itens, pagamentos);

    // 8. Generate ref + URL
    const ref = emissao_id;
    const baseUrl = getFocusBaseUrl(ambiente);
    const url = `${baseUrl}/v2/nfce?ref=${ref}`;

    // 9. Update status to 'processando'
    await admin
      .from("fiscal_nfe_emissoes")
      .update({ status: "processando", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", emissao_id);

    // Log submission
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: "info",
      message: `Submitting NFC-e to Focus (${ambiente})`,
      payload: { url, ref, request_id: requestId, pagamentos_count: pagamentos.length },
    });

    // 10. Call Focus NFe API
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

    // Log response
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: focusResponse.ok ? "info" : "error",
      message: `Focus NFC-e response: ${focusResponse.status}`,
      payload: { status: focusResponse.status, body: focusData, request_id: requestId },
    });

    // 11. Create/update provider link
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

    // 12. Update emissao status
    if (focusResponse.ok) {
      const focusStatus = focusData?.status || "";

      if (focusStatus === "autorizado") {
        const danfeUrl = focusData?.caminho_danfe ? `${baseUrl}${focusData.caminho_danfe}` : null;
        const xmlUrl = focusData?.caminho_xml_nota_fiscal ? `${baseUrl}${focusData.caminho_xml_nota_fiscal}` : null;

        await admin.from("fiscal_nfe_emissoes").update({
          status: "autorizada",
          chave_acesso: focusData?.chave_nfe || null,
          numero: focusData?.numero ? parseInt(focusData.numero) : null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", emissao_id);

        await admin.from("fiscal_nfe_nfeio_emissoes").update({
          provider_status: "autorizado",
          response_payload: focusData,
          danfe_url: danfeUrl,
          xml_url: xmlUrl,
          last_sync_at: new Date().toISOString(),
        }).eq("emissao_id", emissao_id);
      } else if (focusStatus === "erro_autorizacao" || focusStatus === "rejeitado") {
        const rejectMsg = focusData?.mensagem || focusData?.mensagem_sefaz || JSON.stringify(focusData);
        const rejectionCode = parseRejectionCode(rejectMsg);
        const { data: curRow } = await admin.from("fiscal_nfe_emissoes")
          .select("reprocess_count").eq("id", emissao_id).single();
        await admin.from("fiscal_nfe_emissoes").update({
          status: "rejeitada",
          last_error: rejectMsg,
          rejection_code: rejectionCode,
          reprocess_count: (curRow?.reprocess_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", emissao_id);
      } else {
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
      let errorMsg = focusData?.mensagem || focusData?.message || `HTTP ${focusResponse.status}`;
      const erros = Array.isArray(focusData?.erros) ? focusData.erros : [];
      if (erros.length > 0) {
        const details = erros.map((e: any) => `${e.campo}: ${e.mensagem}`).join("; ");
        errorMsg = `${errorMsg} | ${details}`;
      }

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
    try {
      await admin.from("fiscal_nfe_provider_logs").insert({
        empresa_id: empresaId,
        emissao_id,
        provider: "focusnfe",
        level: "error",
        message: `Unexpected error: ${err?.message || String(err)}`,
        payload: { stack: err?.stack, request_id: requestId },
      });
    } catch { /* ignore */ }

    try {
      await admin.from("fiscal_nfe_emissoes").update({
        status: "erro",
        last_error: err?.message || "Unexpected error",
        updated_at: new Date().toISOString(),
      }).eq("id", emissao_id);
    } catch { /* ignore */ }

    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
