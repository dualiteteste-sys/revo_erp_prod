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

  const requestId = getRequestId(req);
  const authHeader = req.headers.get("authorization") || "";

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Determine if this is a CRON call or manual user call
  const isCron = req.headers.get("x-cron") === "true";
  let empresaId: string | null = null;

  if (isCron) {
    // CRON mode: iterate all empresas with focusnfe_registrada = true
    const { data: empresas } = await admin
      .from("fiscal_nfe_emitente")
      .select("empresa_id, cnpj")
      .eq("focusnfe_registrada", true);

    if (!empresas || empresas.length === 0) {
      return json(200, { ok: true, message: "No registered empresas to sync.", synced: 0 }, cors);
    }

    let synced = 0;
    let errors = 0;
    for (const emp of empresas) {
      try {
        await syncEmpresa(admin, emp.empresa_id, emp.cnpj, requestId);
        synced++;
      } catch (err: any) {
        errors++;
        console.error(`[mde-sync] Error syncing empresa ${emp.empresa_id}: ${err.message}`);
      }
    }

    return json(200, { ok: true, synced, errors }, cors);
  }

  // Manual mode: requires JWT auth
  if (!authHeader) return json(401, { ok: false, error: "MISSING_AUTH" }, cors);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json(401, { ok: false, error: "INVALID_TOKEN" }, cors);

  empresaId = req.headers.get("x-empresa-id") || "";
  if (!empresaId) return json(400, { ok: false, error: "MISSING_EMPRESA_ID" }, cors);

  const { data: membership } = await admin
    .from("empresa_usuarios")
    .select("role_id")
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return json(403, { ok: false, error: "NOT_MEMBER" }, cors);

  try {
    const { data: emitente } = await admin
      .from("fiscal_nfe_emitente")
      .select("cnpj, focusnfe_registrada")
      .eq("empresa_id", empresaId)
      .single();
    if (!emitente) {
      return json(422, { ok: false, error: "EMITENTE_NOT_CONFIGURED" }, cors);
    }
    if (!emitente.focusnfe_registrada) {
      return json(422, {
        ok: false,
        error: "NOT_REGISTERED",
        detail: "Registre a empresa na Focus NFe primeiro (Configurações NF-e).",
      }, cors);
    }

    const cleanCnpj = (emitente.cnpj || "").replace(/\D/g, "");
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      return json(422, {
        ok: false,
        error: "CNPJ_INVALIDO",
        detail: "CNPJ da empresa não está preenchido ou é inválido. Verifique em Fiscal → Configurações.",
      }, cors);
    }

    const result = await syncEmpresa(admin, empresaId, emitente.cnpj, requestId);
    return json(200, { ok: true, ...result }, cors);
  } catch (err: any) {
    const msg = err?.message || String(err);
    // FocusNFe returns validation errors (CNPJ not authorized, etc.) — don't mask as 500
    if (msg.includes("Focus NFe MDe API error:")) {
      const focusDetail = msg.replace("Focus NFe MDe API error: ", "");
      const isAuthError = /não autorizado|não informado|não habilitad/i.test(focusDetail);
      return json(422, {
        ok: false,
        error: isAuthError ? "MDE_NAO_HABILITADO" : "FOCUS_VALIDATION_ERROR",
        detail: isAuthError
          ? "Empresa não habilitada para MDe (NFe Recebidas) na FocusNFe. Habilite no Painel API da FocusNFe."
          : focusDetail,
      }, cors);
    }
    return json(500, { ok: false, error: "INTERNAL_ERROR", detail: msg }, cors);
  }
});

async function syncEmpresa(
  admin: any,
  empresaId: string,
  cnpj: string,
  requestId: string,
): Promise<{ fetched: number; upserted: number }> {
  // Get ambiente config
  const { data: config } = await admin
    .from("fiscal_nfe_emissao_config")
    .select("ambiente")
    .eq("empresa_id", empresaId)
    .eq("provider_slug", "FOCUSNFE")
    .maybeSingle();
  const ambiente = config?.ambiente || "homologacao";

  // Per-company token with global fallback
  const apiToken = await getCompanyApiToken(admin, empresaId, ambiente);
  if (!apiToken) throw new Error("MISSING_API_TOKEN");

  // Get sync cursor
  const { data: syncRow } = await admin
    .from("fiscal_nfe_destinadas_sync")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  const versao = syncRow?.focusnfe_versao || 0;
  const cleanCnpj = (cnpj || "").replace(/\D/g, "");
  const baseUrl = getFocusBaseUrl(ambiente);

  // Fetch received NF-e from Focus NFe MDe API
  const url = `${baseUrl}/v2/nfes_recebidas?cnpj=${cleanCnpj}${versao ? `&versao=${versao}` : ""}`;
  const { response, data } = await focusFetch(url, { method: "GET", token: apiToken });

  if (!response.ok) {
    const errorMsg = data?.mensagem || `HTTP ${response.status}`;
    // Update sync status with error
    await upsertSyncStatus(admin, empresaId, {
      last_sync_status: "error",
      last_sync_error: errorMsg,
      last_sync_at: new Date().toISOString(),
    });
    throw new Error(`Focus NFe MDe API error: ${errorMsg}`);
  }

  // Process results
  const nfes = Array.isArray(data) ? data : [];
  let upserted = 0;
  let maxVersao = versao;

  for (const nfe of nfes) {
    try {
      // Map Focus NFe MDe fields to our schema
      const row: Record<string, any> = {
        chave_acesso: nfe.chave || nfe.chave_nfe || "",
        nsu: nfe.nsu || nfe.versao || 0,
        cnpj_emitente: (nfe.cnpj_emitente || "").replace(/\D/g, ""),
        nome_emitente: nfe.nome_emitente || null,
        data_emissao: nfe.data_emissao || null,
        tipo_nfe: nfe.tipo_nfe != null ? Number(nfe.tipo_nfe) : null,
        valor_nf: nfe.valor_total || nfe.valor || 0,
        situacao_nfe: nfe.situacao_nfe != null ? Number(nfe.situacao_nfe) : null,
        xml_resumo_path: null,
      };

      // Upsert via RPC
      await admin.rpc("fiscal_nfe_destinadas_upsert", { p_row: row });
      upserted++;

      // Track max versao for pagination
      const nfeVersao = nfe.versao || nfe.nsu || 0;
      if (nfeVersao > maxVersao) maxVersao = nfeVersao;
    } catch (e: any) {
      console.warn(`[mde-sync] Failed to upsert NF-e ${nfe.chave || "?"}: ${e.message}`);
    }
  }

  // Update sync status
  await upsertSyncStatus(admin, empresaId, {
    focusnfe_versao: maxVersao,
    ultimo_nsu: maxVersao,
    last_sync_at: new Date().toISOString(),
    last_sync_status: "ok",
    last_sync_error: null,
  });

  // Log
  try { await admin.from("fiscal_nfe_provider_logs").insert({
    empresa_id: empresaId,
    provider: "focusnfe",
    level: "info",
    message: `MDe sync: fetched ${nfes.length}, upserted ${upserted}`,
    payload: { versao, maxVersao, request_id: requestId },
  }); } catch { /* ignore log failures */ }

  return { fetched: nfes.length, upserted };
}

async function upsertSyncStatus(
  admin: any,
  empresaId: string,
  fields: Record<string, any>,
) {
  const { data: existing } = await admin
    .from("fiscal_nfe_destinadas_sync")
    .select("empresa_id")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("fiscal_nfe_destinadas_sync")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("empresa_id", empresaId);
  } else {
    await admin
      .from("fiscal_nfe_destinadas_sync")
      .insert({ empresa_id: empresaId, ...fields });
  }
}
