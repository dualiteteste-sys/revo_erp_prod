import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ActionKind = "emitir" | "consultar" | "cancelar";
type AmbienteNfe = "homologacao" | "producao";

type RequestBody = {
  empresa_id?: string;
  emissao_id?: string;
  action?: ActionKind;
  justificativa?: string | null;
};

type FocusApiResult = {
  ok: boolean;
  statusCode: number;
  payload: Record<string, unknown>;
};

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeRole(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function roleRank(role: string): number {
  if (role === "owner") return 100;
  if (role === "admin") return 80;
  if (role === "member") return 50;
  if (role === "finance") return 40;
  if (role === "ops") return 40;
  if (role === "viewer") return 10;
  return 0;
}

function normalizeStatus(raw: unknown): string {
  const status = String(raw ?? "").trim().toLowerCase();
  if (!status) return "processando";
  if (status.includes("autoriz")) return "autorizada";
  if (status.includes("cancel")) return "cancelada";
  if (status.includes("rejeit")) return "rejeitada";
  if (status.includes("erro") || status.includes("deneg")) return "erro";
  if (status.includes("fila") || status.includes("enfileir")) return "enfileirada";
  if (status.includes("process") || status.includes("autorizacao")) return "processando";
  return "processando";
}

function extractErrorMessage(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload?.mensagem_sefaz,
    payload?.motivo,
    payload?.mensagem,
    payload?.erro,
    payload?.error,
    payload?.detail,
  ];

  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text) return text.slice(0, 900);
  }
  return null;
}

function parseBody(data: unknown): RequestBody {
  if (!data || typeof data !== "object") return {};
  const body = data as Record<string, unknown>;
  return {
    empresa_id: typeof body.empresa_id === "string" ? body.empresa_id : undefined,
    emissao_id: typeof body.emissao_id === "string" ? body.emissao_id : undefined,
    action: body.action === "emitir" || body.action === "consultar" || body.action === "cancelar"
      ? body.action
      : undefined,
    justificativa: typeof body.justificativa === "string" ? body.justificativa : null,
  };
}

function trimRef(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function resolveFocusToken(ambiente: AmbienteNfe): string {
  const generic = (Deno.env.get("FOCUSNFE_API_TOKEN") ?? "").trim();
  const hml = (Deno.env.get("FOCUSNFE_API_TOKEN_HML") ?? "").trim();
  const prod = (Deno.env.get("FOCUSNFE_API_TOKEN_PROD") ?? "").trim();

  if (ambiente === "producao") return prod || generic;
  return hml || generic;
}

function resolveBaseUrl(ambiente: AmbienteNfe): string {
  const fromEnv = (Deno.env.get("FOCUSNFE_API_BASE_URL") ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return ambiente === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

async function focusRequest(input: {
  ambiente: AmbienteNfe;
  method: "POST" | "GET" | "DELETE";
  path: string;
  body?: Record<string, unknown> | null;
}): Promise<FocusApiResult> {
  const token = resolveFocusToken(input.ambiente);
  if (!token) {
    throw new Error("FOCUSNFE_API_TOKEN não configurado para este ambiente.");
  }

  const baseUrl = resolveBaseUrl(input.ambiente);
  const url = `${baseUrl}${input.path}`;
  const auth = `Basic ${btoa(`${token}:`)}`;

  const response = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "UltriaERP/focusnfe-emissao",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  return { ok: response.ok, statusCode: response.status, payload };
}

async function buildPayload(admin: ReturnType<typeof createClient>, emissao: any) {
  const empresaId = String(emissao.empresa_id);
  const destinatarioId = String(emissao.destinatario_pessoa_id ?? "");
  if (!destinatarioId) throw new Error("Destinatário não informado.");

  const [{ data: emitente }, { data: destinatario }, { data: enderecoRows }, { data: itens }] = await Promise.all([
    admin
      .from("fiscal_nfe_emitente")
      .select("*")
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    admin
      .from("pessoas")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("id", destinatarioId)
      .maybeSingle(),
    admin
      .from("pessoa_enderecos")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("pessoa_id", destinatarioId)
      .order("created_at", { ascending: true })
      .limit(20),
    admin
      .from("fiscal_nfe_emissao_itens")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("emissao_id", emissao.id)
      .order("ordem", { ascending: true }),
  ]);

  if (!emitente) throw new Error("Emitente não cadastrado.");
  if (!destinatario) throw new Error("Destinatário não encontrado.");
  if (!Array.isArray(itens) || itens.length === 0) throw new Error("Rascunho sem itens.");

  const enderecoPrincipal = Array.isArray(enderecoRows)
    ? (enderecoRows.find((row) => String(row.tipo_endereco ?? "").toUpperCase() === "PRINCIPAL") || enderecoRows[0] || null)
    : null;
  if (!enderecoPrincipal) throw new Error("Destinatário sem endereço cadastrado.");

  const doc = digitsOnly(destinatario.doc_unico);
  const tipoPessoa = doc.length === 11 ? "F" : "J";
  const icmsBase = emissao.total_produtos ?? emissao.valor_total ?? 0;

  const produtos = itens.map((item: any, index: number) => ({
    numero_item: index + 1,
    codigo: String(item.produto_id ?? item.id ?? index + 1),
    descricao: String(item.descricao ?? "Item"),
    cfop: digitsOnly(item.cfop) || "5102",
    ncm: digitsOnly(item.ncm) || "00000000",
    unidade_comercial: String(item.unidade ?? "UN"),
    quantidade_comercial: Number(item.quantidade ?? 0),
    valor_unitario_comercial: Number(item.valor_unitario ?? 0),
    valor_bruto: Number(item.valor_total ?? (Number(item.quantidade ?? 0) * Number(item.valor_unitario ?? 0))),
    valor_desconto: Number(item.valor_desconto ?? 0),
    cst: digitsOnly(item.cst) || undefined,
    csosn: digitsOnly(item.csosn) || undefined,
  }));

  const payload = {
    natureza_operacao: String(emissao.natureza_operacao ?? "Venda de produtos"),
    data_emissao: new Date().toISOString().slice(0, 10),
    tipo_documento: "1",
    finalidade_emissao: "1",
    consumidor_final: true,
    presencial: true,
    indicador_presenca: "1",
    modalidade_frete: "0",
    regime_tributario_emitente: String(emitente.crt ?? 1),
    cnpj_emitente: digitsOnly(emitente.cnpj),
    nome_emitente: String(emitente.razao_social ?? ""),
    cliente: {
      nome: String(destinatario.nome ?? ""),
      tipo_pessoa: tipoPessoa,
      cpf: tipoPessoa === "F" ? doc : undefined,
      cnpj: tipoPessoa === "J" ? doc : undefined,
      email: String(destinatario.email ?? "") || undefined,
      inscricao_estadual: String(destinatario.inscricao_estadual ?? "") || undefined,
      endereco: {
        logradouro: String(enderecoPrincipal.logradouro ?? ""),
        numero: String(enderecoPrincipal.numero ?? "S/N"),
        bairro: String(enderecoPrincipal.bairro ?? ""),
        cidade: String(enderecoPrincipal.cidade ?? ""),
        uf: String(enderecoPrincipal.uf ?? "").toUpperCase(),
        cep: digitsOnly(enderecoPrincipal.cep),
        codigo_municipio: digitsOnly(enderecoPrincipal.cidade_codigo),
      },
    },
    itens: produtos,
    total_produtos: Number(emissao.total_produtos ?? 0),
    total_desconto: Number(emissao.total_descontos ?? 0),
    total_frete: Number(emissao.total_frete ?? 0),
    total_impostos: Number(emissao.total_impostos ?? 0),
    total_nota: Number(emissao.total_nfe ?? emissao.valor_total ?? icmsBase),
  };

  return payload;
}

async function logProviderEvent(admin: ReturnType<typeof createClient>, input: {
  empresaId: string;
  emissaoId: string;
  requestId: string;
  eventType: string;
  status: "requested" | "ok" | "error";
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  httpStatus: number | null;
  errorMessage: string | null;
}) {
  await admin.from("fiscal_nfe_provider_events").insert({
    empresa_id: input.empresaId,
    emissao_id: input.emissaoId,
    provider: "focusnfe",
    event_type: input.eventType,
    status: input.status,
    request_payload: sanitizeForLog(input.requestPayload),
    response_payload: sanitizeForLog(input.responsePayload),
    http_status: input.httpStatus,
    error_message: input.errorMessage,
    request_id: input.requestId,
  });
}

async function logProviderInfo(admin: ReturnType<typeof createClient>, input: {
  empresaId: string;
  emissaoId: string;
  requestId: string;
  level: "info" | "warn" | "error";
  message: string;
  payload?: Record<string, unknown>;
}) {
  await admin.from("fiscal_nfe_provider_logs").insert({
    empresa_id: input.empresaId,
    emissao_id: input.emissaoId,
    provider: "focusnfe",
    level: input.level,
    message: input.message,
    payload: sanitizeForLog(input.payload ?? {}),
    request_id: input.requestId,
  });
}

async function upsertProviderTracking(admin: ReturnType<typeof createClient>, input: {
  empresaId: string;
  emissaoId: string;
  ambiente: AmbienteNfe;
  ref: string;
  providerStatus: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
}) {
  await admin.from("fiscal_nfe_nfeio_emissoes").upsert({
    empresa_id: input.empresaId,
    emissao_id: input.emissaoId,
    ambiente: input.ambiente,
    nfeio_id: input.ref,
    provider_status: input.providerStatus,
    request_payload: sanitizeForLog(input.requestPayload),
    response_payload: sanitizeForLog(input.responsePayload),
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "emissao_id" });
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const requestId = getRequestId(req);

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authErr } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) {
      return json(401, { ok: false, error: "UNAUTHORIZED" }, cors);
    }

    const body = parseBody(await req.json().catch(() => ({})));
    const empresaId = String(body.empresa_id ?? "").trim();
    const emissaoId = String(body.emissao_id ?? "").trim();
    const action: ActionKind = body.action ?? "consultar";
    if (!empresaId || !emissaoId) {
      return json(400, { ok: false, error: "INVALID_PAYLOAD", message: "empresa_id e emissao_id são obrigatórios." }, cors);
    }

    const { data: membership } = await admin
      .from("empresa_usuarios")
      .select("role,status")
      .eq("empresa_id", empresaId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return json(403, { ok: false, error: "FORBIDDEN" }, cors);

    const role = normalizeRole(membership.role);
    const status = normalizeRole(membership.status);
    if (!["active", "pending"].includes(status)) {
      return json(403, { ok: false, error: "FORBIDDEN", message: "Usuário sem vínculo ativo com a empresa." }, cors);
    }
    if (["emitir", "cancelar"].includes(action) && roleRank(role) < roleRank("admin")) {
      return json(403, { ok: false, error: "FORBIDDEN", message: "Apenas admin/owner pode executar esta ação fiscal." }, cors);
    }

    const { data: emissao, error: emissaoErr } = await admin
      .from("fiscal_nfe_emissoes")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("id", emissaoId)
      .maybeSingle();
    if (emissaoErr || !emissao) {
      return json(404, { ok: false, error: "NOT_FOUND", message: "Emissão não encontrada." }, cors);
    }

    const ambiente = (emissao.ambiente === "producao" ? "producao" : "homologacao") as AmbienteNfe;
    const focusRef = trimRef(String(emissao.provider_ref ?? emissao.id ?? ""));
    if (!focusRef) {
      return json(422, { ok: false, error: "INVALID_REF", message: "Referência inválida para a NF-e." }, cors);
    }

    if (action === "emitir") {
      const { data: flags } = await admin
        .from("empresa_feature_flags")
        .select("nfe_emissao_enabled")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (!flags?.nfe_emissao_enabled) {
        return json(422, { ok: false, error: "EMISSAO_DISABLED", message: "Emissão de NF-e está desativada para a empresa." }, cors);
      }

      const { data: previewRows, error: previewErr } = await admin.rpc("fiscal_nfe_preview_xml", { p_emissao_id: emissaoId });
      if (previewErr) throw previewErr;
      const preview = Array.isArray(previewRows) ? previewRows[0] : previewRows;
      if (!preview?.ok) {
        return json(422, {
          ok: false,
          error: "DRAFT_INVALID",
          message: "Rascunho inválido para emissão.",
          details: preview?.errors ?? [],
          warnings: preview?.warnings ?? [],
        }, cors);
      }
    }

    const requestPayload = action === "emitir"
      ? await buildPayload(admin, emissao)
      : action === "cancelar"
      ? { justificativa: String(body.justificativa ?? "").trim() || "Cancelamento solicitado pelo usuário." }
      : {};

    let focusRes: FocusApiResult;
    if (action === "emitir") {
      focusRes = await focusRequest({
        ambiente,
        method: "POST",
        path: `/v2/nfe?ref=${encodeURIComponent(focusRef)}`,
        body: requestPayload,
      });
    } else if (action === "cancelar") {
      focusRes = await focusRequest({
        ambiente,
        method: "DELETE",
        path: `/v2/nfe/${encodeURIComponent(focusRef)}`,
        body: requestPayload,
      });
    } else {
      focusRes = await focusRequest({
        ambiente,
        method: "GET",
        path: `/v2/nfe/${encodeURIComponent(focusRef)}`,
      });
    }

    const providerStatus = String(focusRes.payload?.status ?? "").trim() || null;
    const mappedStatus = action === "emitir" && focusRes.ok
      ? "enfileirada"
      : normalizeStatus(providerStatus);

    const lastError = !focusRes.ok ? extractErrorMessage(focusRes.payload) : null;
    const nextPayload = {
      ...(typeof emissao.payload === "object" && emissao.payload ? emissao.payload : {}),
      focus_last_sync: {
        action,
        request_id: requestId,
        synced_at: new Date().toISOString(),
        status_code: focusRes.statusCode,
        response: sanitizeForLog(focusRes.payload),
      },
    };

    await admin
      .from("fiscal_nfe_emissoes")
      .update({
        provider_slug: "FOCUSNFE",
        provider_ref: focusRef,
        status: mappedStatus,
        numero: Number(focusRes.payload?.numero ?? emissao.numero ?? 0) || null,
        serie: Number(focusRes.payload?.serie ?? emissao.serie ?? 0) || null,
        chave_acesso: String(focusRes.payload?.chave_acesso ?? focusRes.payload?.chave ?? emissao.chave_acesso ?? "") || null,
        last_error: lastError,
        payload: nextPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emissaoId)
      .eq("empresa_id", empresaId);

    await upsertProviderTracking(admin, {
      empresaId,
      emissaoId,
      ambiente,
      ref: focusRef,
      providerStatus,
      requestPayload,
      responsePayload: focusRes.payload,
    });

    await logProviderEvent(admin, {
      empresaId,
      emissaoId,
      requestId,
      eventType: action,
      status: focusRes.ok ? "ok" : "error",
      requestPayload,
      responsePayload: focusRes.payload,
      httpStatus: focusRes.statusCode,
      errorMessage: !focusRes.ok ? extractErrorMessage(focusRes.payload) : null,
    });

    await logProviderInfo(admin, {
      empresaId,
      emissaoId,
      requestId,
      level: focusRes.ok ? "info" : "error",
      message: focusRes.ok ? `Focus ${action} concluído` : `Focus ${action} falhou`,
      payload: {
        action,
        status_code: focusRes.statusCode,
        provider_status: providerStatus,
      },
    });

    return json(focusRes.ok ? 200 : 422, {
      ok: focusRes.ok,
      action,
      emissao_id: emissaoId,
      status: mappedStatus,
      provider_status: providerStatus,
      status_code: focusRes.statusCode,
      message: focusRes.ok
        ? action === "emitir"
          ? "NF-e enviada para processamento na Focus."
          : action === "cancelar"
          ? "Solicitação de cancelamento enviada."
          : "Status consultado com sucesso."
        : extractErrorMessage(focusRes.payload) ?? "Falha na operação com a Focus.",
      response: sanitizeForLog(focusRes.payload),
      request_id: requestId,
    }, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "internal_error");
    return json(500, {
      ok: false,
      error: "INTERNAL_ERROR",
      message,
      request_id: requestId,
    }, cors);
  }
});
