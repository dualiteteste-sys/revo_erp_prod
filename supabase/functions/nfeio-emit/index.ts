import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { digitsOnly, nfeioBaseUrl, nfeioFetchJson, type NfeioEnvironment } from "../_shared/nfeio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NFEIO_API_KEY = Deno.env.get("NFEIO_API_KEY")!;

type EmitBody = { emissao_id?: string };

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function canEmitNfe(userClient: any, svc: any, callerId: string, empresaId: string): Promise<boolean> {
  let allowed = false;
  try {
    const { data } = await userClient.rpc("has_permission_for_current_user", {
      p_module: "fiscal",
      p_action: "nfe_emit",
    });
    allowed = !!data;
  } catch {
    // ignore
  }

  if (allowed) return true;

  const { data: link } = await svc
    .from("empresa_usuarios")
    .select("role_id")
    .eq("empresa_id", empresaId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (!link?.role_id) return false;

  const { data: role } = await svc.from("roles").select("slug").eq("id", link.role_id).maybeSingle();
  return role?.slug === "OWNER" || role?.slug === "ADMIN";
}

async function logEvent(
  admin: any,
  empresaId: string,
  emissaoId: string | null,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  payload: any,
) {
  try {
    await admin.from("fiscal_nfe_provider_logs").insert({
      empresa_id: empresaId,
      emissao_id: emissaoId,
      provider: "nfeio",
      level,
      message,
      payload,
    });
  } catch {
    // best-effort
  }
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  if (!NFEIO_API_KEY) return json(500, { ok: false, error: "MISSING_NFEIO_API_KEY" }, cors);

  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: me } = await user.auth.getUser();
  const userId = me?.user?.id;
  if (!userId) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const body = (await req.json().catch(() => ({}))) as EmitBody;
  const emissaoId = (body.emissao_id ?? "").trim();
  if (!emissaoId) return json(400, { ok: false, error: "MISSING_EMISSAO_ID" }, cors);

  const { data: emissao, error: emissaoErr } = await admin
    .from("fiscal_nfe_emissoes")
    .select("id,empresa_id,status,ambiente,destinatario_pessoa_id,total_frete,natureza_operacao")
    .eq("id", emissaoId)
    .maybeSingle();
  if (emissaoErr || !emissao?.id) return json(404, { ok: false, error: "EMISSAO_NOT_FOUND" }, cors);

  const empresaId = emissao.empresa_id as string;
  const ambiente = (emissao.ambiente ?? "homologacao") as NfeioEnvironment;

  // RBAC: exige permissão ou OWNER/ADMIN no tenant da emissão
  const allowed = await canEmitNfe(user, admin, userId, empresaId);
  if (!allowed) {
    return json(403, { ok: false, error: "FORBIDDEN_RBAC" }, cors);
  }

  await admin.from("fiscal_nfe_emissoes").update({ status: "processando", last_error: null }).eq("id", emissaoId);

  // Pega itens
  const { data: itens, error: itensErr } = await admin
    .from("fiscal_nfe_emissao_itens")
    .select("descricao,quantidade,valor_unitario")
    .eq("emissao_id", emissaoId)
    .order("ordem", { ascending: true });
  if (itensErr) {
    await admin.from("fiscal_nfe_emissoes").update({ status: "erro", last_error: itensErr.message }).eq("id", emissaoId);
    return json(500, { ok: false, error: "LOAD_ITENS_FAILED" }, cors);
  }

  // Destinatário
  let cliente: any = { nome: "Consumidor" };
  if (emissao.destinatario_pessoa_id) {
    const { data: pessoa } = await admin
      .from("pessoas")
      .select("id,nome,doc_unico")
      .eq("id", emissao.destinatario_pessoa_id)
      .maybeSingle();
    if (pessoa?.id) {
      const doc = digitsOnly(pessoa.doc_unico);
      cliente = { nome: pessoa.nome ?? "Consumidor" };
      if (doc.length === 11) cliente.cpf = doc;
      else if (doc.length === 14) cliente.cnpj = doc;
    }
  }

  // (Opcional) gerar e salvar XML de preview para troubleshooting
  try {
    const { data: preview } = await admin.rpc("fiscal_nfe_preview_xml", { p_emissao_id: emissaoId });
    const xml = preview?.xml as string | undefined;
    if (xml) {
      const path = `${empresaId}/${emissaoId}/preview.xml`;
      await admin.storage.from("nfe_docs").upload(path, new Blob([xml], { type: "application/xml" }), {
        upsert: true,
        contentType: "application/xml",
      });
      await admin.from("fiscal_nfe_nfeio_emissoes").upsert({
        empresa_id: empresaId,
        emissao_id: emissaoId,
        ambiente,
        xml_storage_path: path,
      }, { onConflict: "emissao_id" });
    }
  } catch {
    // ignore
  }

  // Payload mínimo conforme docs NFE.io (pode evoluir)
  const payload = {
    cliente,
    itens: (itens ?? []).map((it: any) => ({
      descricao: it.descricao ?? "Item",
      quantidade: Number(it.quantidade ?? 1),
      valorUnitario: Number(it.valor_unitario ?? 0),
    })),
  };

  const idempotencyKey = crypto.randomUUID();
  const base = nfeioBaseUrl(ambiente);
  const url = `${base}/v2/nota-fiscal`;

  await logEvent(admin, empresaId, emissaoId, "info", "NFEIO_EMIT_REQUEST", { url, payload, idempotencyKey, ambiente });

  const result = await nfeioFetchJson(url, {
    method: "POST",
    headers: {
      "X-Api-Key": NFEIO_API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  await admin.from("fiscal_nfe_nfeio_emissoes").upsert({
    empresa_id: empresaId,
    emissao_id: emissaoId,
    ambiente,
    idempotency_key: idempotencyKey,
    nfeio_id: result.data?.id ?? null,
    provider_status: result.data?.status ?? null,
    request_payload: payload,
    response_payload: result.data ?? {},
    last_sync_at: new Date().toISOString(),
  }, { onConflict: "emissao_id" });

  if (!result.ok) {
    await logEvent(admin, empresaId, emissaoId, "error", "NFEIO_EMIT_FAILED", { status: result.status, data: result.data });
    await admin.from("fiscal_nfe_emissoes").update({ status: "erro", last_error: JSON.stringify(result.data).slice(0, 900) }).eq("id", emissaoId);
    return json(502, { ok: false, error: "NFEIO_EMIT_FAILED", status: result.status, data: result.data }, cors);
  }

  await logEvent(admin, empresaId, emissaoId, "info", "NFEIO_EMIT_OK", { status: result.status, data: result.data });
  await admin.from("fiscal_nfe_emissoes").update({ status: "enfileirada", last_error: null }).eq("id", emissaoId);

  return json(200, { ok: true, nfeio_id: result.data?.id ?? null, data: result.data }, cors);
});
