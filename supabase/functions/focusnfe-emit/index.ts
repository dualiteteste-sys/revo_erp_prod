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
// Rejection code parser (NFE-STA-01)
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
// Data mappers: internal schema -> Focus NFe API format
// ---------------------------------------------------------------------------

function mapCrt(crt: number): string {
  // 1 = Simples Nacional, 2 = SN excesso sublimite, 3 = Regime Normal
  return String(crt || 1);
}

// Forma de pagamento mapping
const FORMA_PAGAMENTO_MAP: Record<string, string> = {
  dinheiro: "01",
  cheque: "02",
  cartao_credito: "03",
  cartao_debito: "04",
  credito_loja: "05",
  vale_alimentacao: "10",
  vale_refeicao: "11",
  vale_presente: "12",
  vale_combustivel: "13",
  boleto: "15",
  deposito: "16",
  pix: "17",
  transferencia: "18",
  sem_pagamento: "90",
  outros: "99",
};

function mapFormaPagamento(forma: string | null | undefined): string {
  if (!forma) return "99";
  return FORMA_PAGAMENTO_MAP[forma.toLowerCase()] || forma.replace(/\D/g, "") || "99";
}

function buildFocusPayload(
  emitente: any,
  dest: any,
  emissao: any,
  itens: any[],
  transportadora?: any,
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

    // Destinatario
    nome_destinatario: dest.nome || dest.razao_social || "",
    logradouro_destinatario: dest.endereco_logradouro || dest.logradouro || "",
    numero_destinatario: dest.endereco_numero || dest.numero || "S/N",
    complemento_destinatario: dest.endereco_complemento || dest.complemento || "",
    bairro_destinatario: dest.endereco_bairro || dest.bairro || "",
    municipio_destinatario: dest.endereco_municipio || dest.municipio || "",
    uf_destinatario: dest.endereco_uf || dest.uf || "",
    cep_destinatario: (dest.endereco_cep || dest.cep || "").replace(/\D/g, ""),
    ...(dest.cidade_codigo ? { codigo_municipio_destinatario: dest.cidade_codigo } : {}),
    ...(dest.email ? { email_destinatario: dest.email } : {}),
    ...(dest.telefone ? { telefone_destinatario: (dest.telefone || "").replace(/\D/g, "") } : {}),

    // Operacao
    natureza_operacao: emissao.natureza_operacao || "Venda de mercadoria",
    data_emissao: now,
    tipo_documento: "1", // 1 = saida
    finalidade_emissao: emissao.finalidade_emissao || "1",
    local_destino: "1", // 1 = operacao interna
    presenca_comprador: "9", // 9 = nao se aplica (online)

    // Frete
    modalidade_frete: emissao.modalidade_frete || "9",
    valor_frete: emissao.total_frete || 0,

    // Totais
    valor_produtos: emissao.total_produtos || 0,
    valor_total: emissao.valor_total || emissao.total_nfe || 0,
    valor_desconto: emissao.total_descontos || 0,

    // Forma de pagamento
    formas_pagamento: [{
      forma_pagamento: mapFormaPagamento(emissao.forma_pagamento),
      valor_pagamento: emissao.valor_total || emissao.total_nfe || 0,
    }],

    // Items
    items: itens.map((item, idx) => {
      const impostos = item.impostos && typeof item.impostos === "object" && Object.keys(item.impostos).length > 0
        ? item.impostos
        : null;

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

      // CFOP
      if (item.cfop) {
        itemPayload.cfop = item.cfop;
      }

      // Desconto
      if (item.valor_desconto && item.valor_desconto > 0) {
        itemPayload.valor_desconto = String(item.valor_desconto);
      }

      // --- ICMS (from impostos JSONB or fallback) ---
      // Normalize CST: strip leading zero for 3-digit codes (e.g. "090" → "90")
      const normCst = (v: string) => v.replace(/^0(\d{2})$/, "$1");
      if (impostos?.icms) {
        const icms = impostos.icms;
        if (isRegimeNormal && icms.cst) {
          itemPayload.icms_situacao_tributaria = normCst(icms.cst);
          // modBC must precede vBC in the NF-e XML schema
          // 0=MVA, 1=Pauta, 2=Preço Tabelado Máx, 3=Valor da Operação (default)
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
        // Legacy fallback
        if (item.csosn) {
          itemPayload.icms_situacao_tributaria = item.csosn;
        } else if (item.cst) {
          itemPayload.icms_situacao_tributaria = normCst(item.cst);
        } else {
          itemPayload.icms_situacao_tributaria = "102";
        }
      }

      // --- PIS (from impostos JSONB or fallback) ---
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

      // --- COFINS (from impostos JSONB or fallback) ---
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

      // --- IPI (from impostos JSONB, optional) ---
      if (impostos?.ipi && impostos.ipi.cst) {
        const ipi = impostos.ipi;
        itemPayload.ipi_situacao_tributaria = ipi.cst;
        if (ipi.base_calculo != null) itemPayload.ipi_base_calculo = String(ipi.base_calculo);
        if (ipi.aliquota != null && ipi.aliquota > 0) itemPayload.ipi_aliquota = String(ipi.aliquota);
        if (ipi.valor != null && ipi.valor > 0) itemPayload.ipi_valor = String(ipi.valor);
      }

      // --- cBenef (Código de Benefício Fiscal) ---
      // Tag cBenef (I05f) é campo do ITEM (det/prod/cBenef), não do ICMS.
      // Fontes (prioridade): item.codigo_beneficio_fiscal → impostos.icms.codigo_beneficio_fiscal
      // DEVE ficar fora dos blocos ICMS para executar em qualquer caminho.
      {
        const cBenef = (item.codigo_beneficio_fiscal || impostos?.icms?.codigo_beneficio_fiscal || "").trim();
        if (cBenef) itemPayload.codigo_beneficio_fiscal = cBenef;
      }

      // --- xPed / nItemPed / infAdProd (Fase 7) ---
      if (item.numero_pedido_cliente) {
        itemPayload.numero_pedido = item.numero_pedido_cliente;
      }
      if (item.numero_item_pedido) {
        itemPayload.numero_item_pedido = String(item.numero_item_pedido);
      }
      if (item.informacoes_adicionais) {
        itemPayload.informacoes_adicionais_item = item.informacoes_adicionais;
      }

      return itemPayload;
    }),
  };

  // Destinatario CPF ou CNPJ (from dest.cpf_cnpj normalized above)
  const cpfCnpj = (dest.cpf_cnpj || dest.doc_unico || "").replace(/\D/g, "");
  // contribuinte_icms enum: '1'=Contribuinte, '2'=Isento, '9'=Não Contribuinte (default)
  const contribuinte = dest.contribuinte_icms ?? "9";
  const ieValue = (dest.ie || "").trim();

  if (cpfCnpj.length === 14) {
    payload.cnpj_destinatario = cpfCnpj;
    if (ieValue && contribuinte !== "2" && dest.isento_ie !== true) {
      payload.indicador_inscricao_estadual_destinatario = "1";
      payload.inscricao_estadual_destinatario = ieValue;
    } else if (contribuinte === "2" || dest.isento_ie === true) {
      payload.indicador_inscricao_estadual_destinatario = "2";
      payload.inscricao_estadual_destinatario = "ISENTO";
    } else {
      payload.indicador_inscricao_estadual_destinatario = "9";
    }
  } else if (cpfCnpj.length === 11) {
    payload.cpf_destinatario = cpfCnpj;
    payload.indicador_inscricao_estadual_destinatario = "9";
  }

  // Consumidor final: CPF → sempre consumidor final (B2C); CNPJ → B2B por padrão
  payload.consumidor_final = cpfCnpj.length === 11 ? "1" : "0";

  // UF destino = mesmo que emitente -> operacao interna
  if (
    payload.uf_destinatario &&
    payload.uf_emitente &&
    payload.uf_destinatario !== payload.uf_emitente
  ) {
    payload.local_destino = "2"; // interestadual
  }

  // Modalidade frete (from emissao or fallback)
  if (emissao.total_frete && emissao.total_frete > 0 && payload.modalidade_frete === "9") {
    payload.modalidade_frete = "1"; // 1 = emitente (CIF)
  }

  // --- Peso / Volumes ---
  if (emissao.peso_bruto && emissao.peso_bruto > 0) {
    payload.peso_bruto = String(emissao.peso_bruto);
  }
  if (emissao.peso_liquido && emissao.peso_liquido > 0) {
    payload.peso_liquido = String(emissao.peso_liquido);
  }
  if (emissao.quantidade_volumes && emissao.quantidade_volumes > 0) {
    payload.volumes = [{
      quantidade: String(emissao.quantidade_volumes),
      especie: emissao.especie_volumes || "VOLUMES",
      peso_bruto: String(emissao.peso_bruto || 0),
      peso_liquido: String(emissao.peso_liquido || 0),
    }];
  }

  // --- Transportadora (Fase 5) ---
  if (transportadora) {
    if (transportadora.documento) {
      const docClean = (transportadora.documento || "").replace(/\D/g, "");
      if (docClean.length === 14) {
        payload.cnpj_transportador = docClean;
      } else if (docClean.length === 11) {
        payload.cpf_transportador = docClean;
      }
    }
    if (transportadora.nome) payload.nome_transportador = transportadora.nome;
    if (transportadora.ie_rg) payload.inscricao_estadual_transportador = transportadora.ie_rg;
    if (transportadora.endereco_logradouro) {
      payload.endereco_transportador = [
        transportadora.endereco_logradouro,
        transportadora.endereco_numero,
      ].filter(Boolean).join(", ");
    }
    if (transportadora.endereco_cidade) payload.municipio_transportador = transportadora.endereco_cidade;
    if (transportadora.endereco_uf) payload.uf_transportador = transportadora.endereco_uf;
  }

  // --- Duplicatas / Cobrança (Fase 4) ---
  const duplicatas = Array.isArray(emissao.duplicatas) ? emissao.duplicatas : [];
  if (duplicatas.length > 0) {
    payload.duplicatas = duplicatas.map((d: any) => ({
      numero: d.numero || "001",
      data_vencimento: d.data_vencimento,
      valor: String(d.valor || 0),
    }));
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

    // 2. Read emitente (two independent queries — avoids silent FK join failures)
    const { data: emitente, error: emitErr } = await admin
      .from("fiscal_nfe_emitente")
      .select("*")
      .eq("empresa_id", empresaId.trim())
      .single();
    if (emitErr || !emitente) {
      // Log the actual error so we can diagnose "row not found" vs "query failed"
      try { await admin.from("fiscal_nfe_provider_logs").insert({
        empresa_id: empresaId,
        emissao_id,
        provider: "focusnfe",
        level: "error",
        message: `EMITENTE_NOT_CONFIGURED: ${emitErr?.message || "row not found"}`,
        payload: { error_code: emitErr?.code, hint: emitErr?.hint, request_id: requestId },
      }); } catch { /* ignore log failures */ }
      return json(422, {
        ok: false,
        error: "EMITENTE_NOT_CONFIGURED",
        detail: "Acesse Fiscal → Configurações e preencha os dados do emitente (CNPJ, Razão Social, IE, endereço).",
      }, cors);
    }

    // Fallback: enrich with empresas data for fields not yet filled in the emitente form
    const { data: empresa } = await admin
      .from("empresas")
      .select("cnpj, nome_razao_social, nome_fantasia, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf")
      .eq("id", emitente.empresa_id)
      .single();

    const emitenteFull = {
      ...emitente,
      // Identity: fiscal_nfe_emitente is source of truth; fall back to empresas
      cnpj: emitente.cnpj || empresa?.cnpj || "",
      razao_social: emitente.razao_social || empresa?.nome_razao_social || "",
      nome_fantasia: emitente.nome_fantasia || empresa?.nome_fantasia || "",
      // Address: prefer fiscal_nfe_emitente (customizable), fall back to empresas
      endereco_logradouro: emitente.endereco_logradouro || empresa?.endereco_logradouro || "",
      endereco_numero: emitente.endereco_numero || empresa?.endereco_numero || "S/N",
      endereco_complemento: emitente.endereco_complemento || empresa?.endereco_complemento || "",
      endereco_bairro: emitente.endereco_bairro || empresa?.endereco_bairro || "",
      endereco_municipio: emitente.endereco_municipio || empresa?.endereco_cidade || "",
      endereco_uf: emitente.endereco_uf || empresa?.endereco_uf || "",
      endereco_cep: emitente.endereco_cep || empresa?.endereco_cep || "",
    };

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

    // 3a. Read destinatario address (pessoa_enderecos — same pattern as preview RPC)
    const { data: destEndereco } = await admin
      .from("pessoa_enderecos")
      .select("*")
      .eq("pessoa_id", emissao.destinatario_pessoa_id)
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    // Also try to get fiscal data
    const { data: destFiscal } = await admin
      .from("fiscal_nfe_cliente_cadastro")
      .select("*")
      .eq("pessoa_id", emissao.destinatario_pessoa_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    // Merge: pessoa + endereco + fiscal (endereco fields normalized for buildFocusPayload)
    const dest: Record<string, any> = {
      ...destPessoa,
      ...(destFiscal || {}),
      // Map pessoa_enderecos columns → names expected by buildFocusPayload
      logradouro: destEndereco?.logradouro || "",
      numero: destEndereco?.numero || "S/N",
      complemento: destEndereco?.complemento || "",
      bairro: destEndereco?.bairro || "",
      municipio: destEndereco?.cidade || "",  // pessoa_enderecos uses "cidade"
      uf: destEndereco?.uf || "",
      cep: destEndereco?.cep || "",
      cidade_codigo: destEndereco?.cidade_codigo || "",
      // CPF/CNPJ: pessoas uses doc_unico
      cpf_cnpj: destPessoa.doc_unico || "",
      // IE: pessoas uses inscr_estadual
      ie: destPessoa.inscr_estadual || "",
      // Contato: pessoas.email / pessoas.telefone
      email: destPessoa.email || destFiscal?.email || "",
      telefone: destPessoa.telefone || destPessoa.celular || "",
    };

    // 3b. Pre-flight: validate required address fields before calling Focus API
    const missingFields: string[] = [];
    if (!dest.logradouro) missingFields.push("Logradouro");
    if (!dest.bairro) missingFields.push("Bairro");
    if (!dest.municipio) missingFields.push("Município");
    if (!dest.uf) missingFields.push("UF");
    if (!(dest.cep || "").replace(/\D/g, "")) missingFields.push("CEP");
    if (!(dest.cpf_cnpj || "").replace(/\D/g, "")) missingFields.push("CPF/CNPJ");
    if (!destEndereco) missingFields.push("Endereço (nenhum endereço cadastrado)");

    if (missingFields.length > 0) {
      const detail = `Dados incompletos no cadastro do destinatário "${dest.nome || ""}": ${missingFields.join(", ")}. Atualize o cadastro do cliente antes de emitir a NF-e.`;
      await admin.from("fiscal_nfe_emissoes").update({
        status: "erro",
        last_error: detail,
        updated_at: new Date().toISOString(),
      }).eq("id", emissao_id);

      return json(422, { ok: false, error: "DESTINATARIO_INCOMPLETO", detail, missing_fields: missingFields }, cors);
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

    // 4b. Read transportadora (if linked)
    let transportadora: any = null;
    if (emissao.transportadora_id) {
      const { data: transp } = await admin
        .from("logistica_transportadoras")
        .select("*, pessoa:pessoas(nome, doc_unico, email, telefone)")
        .eq("id", emissao.transportadora_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (transp) {
        transportadora = {
          ...transp,
          nome: transp.pessoa?.nome || transp.razao_social || "",
          documento: transp.documento || transp.pessoa?.doc_unico || "",
        };
      }
    }

    // 4c. Read natureza de operação (for finalidade_emissao)
    if (emissao.natureza_operacao_id) {
      const { data: natOp } = await admin
        .from("fiscal_naturezas_operacao")
        .select("finalidade_emissao, observacoes_padrao")
        .eq("id", emissao.natureza_operacao_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (natOp) {
        emissao.finalidade_emissao = natOp.finalidade_emissao || "1";
        if (natOp.observacoes_padrao) {
          emissao.informacoes_complementares = natOp.observacoes_padrao;
        }
      }
    }

    // 5. Determine ambiente
    const ambiente = emissao.ambiente || "homologacao";
    const apiToken = await getCompanyApiToken(admin, empresaId, ambiente);
    if (!apiToken) {
      return json(500, { ok: false, error: "MISSING_API_TOKEN", detail: `Token for ${ambiente} not configured` }, cors);
    }

    // 5b. Read serie + proximo_numero from fiscal_nfe_numeracao
    const { data: numeracao } = await admin
      .from("fiscal_nfe_numeracao")
      .select("id, serie, proximo_numero")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("serie", { ascending: true })
      .limit(1)
      .maybeSingle();

    // 6. Build Focus NFe payload
    const focusPayload = buildFocusPayload(emitenteFull, dest, emissao, itens, transportadora);

    // 6a. Inject serie + numero from numeracao (if configured)
    if (numeracao) {
      focusPayload.serie = String(numeracao.serie);
      focusPayload.numero = String(numeracao.proximo_numero);
    }

    // 6b. Pre-flight: validate cBenef on items that require it
    // CSTs that require cBenef (per NT 2019.001 / N12-85): 20,30,40,41,50,51,70,90
    const CST_REQUIRES_CBENEF = new Set(["20", "30", "40", "41", "50", "51", "70", "90"]);
    const ufEmitente = (emitenteFull.endereco_uf || "").toUpperCase();
    const cbenefWarnings: string[] = [];
    if (focusPayload.items && Array.isArray(focusPayload.items)) {
      for (const fi of focusPayload.items) {
        const cst = String(fi.icms_situacao_tributaria || "");
        if (CST_REQUIRES_CBENEF.has(cst) && !fi.codigo_beneficio_fiscal) {
          cbenefWarnings.push(
            `Item ${fi.numero_item} (${fi.descricao}): CST ${cst} exige cBenef mas não informado. ` +
            `Preencha o campo "cBenef" no item do rascunho ou use SP099999 (sem benefício).`
          );
        }
      }
    }
    if (cbenefWarnings.length > 0) {
      const detail = `Validação cBenef: ${cbenefWarnings.join(" | ")}`;
      await admin.from("fiscal_nfe_emissoes").update({
        status: "erro",
        last_error: detail,
        updated_at: new Date().toISOString(),
      }).eq("id", emissao_id);

      await admin.from("fiscal_nfe_provider_logs").insert({
        empresa_id: empresaId,
        emissao_id,
        provider: "focusnfe",
        level: "warn",
        message: `cBenef validation failed`,
        payload: { warnings: cbenefWarnings, uf: ufEmitente, request_id: requestId },
      });

      return json(422, {
        ok: false,
        error: "CBENEF_MISSING",
        detail,
        warnings: cbenefWarnings,
      }, cors);
    }

    // 7. Generate idempotency ref (use emissao UUID)
    const ref = emissao_id;
    const baseUrl = getFocusBaseUrl(ambiente);
    const url = `${baseUrl}/v2/nfe?ref=${ref}`;

    // 8. Update status to 'processando' + save serie/numero
    const emissaoUpdate: Record<string, any> = {
      status: "processando",
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    if (numeracao) {
      emissaoUpdate.serie = numeracao.serie;
      emissaoUpdate.numero = numeracao.proximo_numero;
    }
    await admin
      .from("fiscal_nfe_emissoes")
      .update(emissaoUpdate)
      .eq("id", emissao_id);

    // Log the submission (include cBenef values for each item for diagnostics)
    const itemsCbenefDiag = (focusPayload.items || []).map((fi: any) => ({
      numero_item: fi.numero_item,
      cst: fi.icms_situacao_tributaria,
      codigo_beneficio_fiscal: fi.codigo_beneficio_fiscal || null,
    }));
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: "info",
      message: `Submitting NFe to Focus (${ambiente})`,
      payload: { url, ref, request_id: requestId, items_cbenef: itemsCbenefDiag },
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
        // caminho_danfe/caminho_xml are relative paths — prepend Focus base URL
        const danfeUrl = focusData?.caminho_danfe ? `${baseUrl}${focusData.caminho_danfe}` : null;
        const xmlUrl = focusData?.caminho_xml_nota_fiscal ? `${baseUrl}${focusData.caminho_xml_nota_fiscal}` : null;

        await admin.from("fiscal_nfe_emissoes").update({
          status: "autorizada",
          chave_acesso: focusData?.chave_nfe || null,
          numero: focusData?.numero ? parseInt(focusData.numero) : null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", emissao_id);

        // Save DANFE/XML URLs to provider link
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
        // Still processing (processando_autorizacao)
        await admin.from("fiscal_nfe_emissoes").update({
          status: "processando",
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", emissao_id);
      }

      // Increment proximo_numero on successful submission (not rejection)
      if (numeracao && focusStatus !== "erro_autorizacao" && focusStatus !== "rejeitado") {
        await admin.from("fiscal_nfe_numeracao").update({
          proximo_numero: numeracao.proximo_numero + 1,
        }).eq("id", numeracao.id);
      }

      return json(200, {
        ok: true,
        status: focusStatus || "processando",
        focus_response: focusData,
        ref,
      }, cors);
    } else {
      // API error — build detailed message including field-level errors
      let errorMsg = focusData?.mensagem || focusData?.message || `HTTP ${focusResponse.status}`;
      const erros = Array.isArray(focusData?.erros) ? focusData.erros : [];
      if (erros.length > 0) {
        const details = erros.map((e: any) => `${e.campo}: ${e.mensagem}`).join("; ");
        errorMsg = `${errorMsg} | ${details}`;
      }

      // Enrich emitente-related errors with the CNPJ sent for diagnostics
      const cnpjSent = (emitenteFull.cnpj || "").replace(/\D/g, "");
      const isEmitenteError = /emitente|cnpj.*n[aã]o.*autoriz/i.test(errorMsg);
      if (isEmitenteError && cnpjSent) {
        errorMsg = `${errorMsg} | CNPJ enviado: ${cnpjSent} (ambiente: ${ambiente}). Verifique se este CNPJ está habilitado no painel Focus NFe para o ambiente "${ambiente}".`;
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
    // Unexpected error
    try { await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id,
      provider: "focusnfe",
      level: "error",
      message: `Unexpected error: ${err?.message || String(err)}`,
      payload: { stack: err?.stack, request_id: requestId },
    }); } catch { /* ignore log failures */ }

    try { await admin.from("fiscal_nfe_emissoes").update({
      status: "erro",
      last_error: err?.message || "Unexpected error",
      updated_at: new Date().toISOString(),
    }).eq("id", emissao_id); } catch { /* ignore */ }

    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: err?.message }, cors);
  }
});
