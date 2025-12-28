import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { nfeioBaseUrl, nfeioFetchJson, type NfeioEnvironment } from "../_shared/nfeio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NFEIO_API_KEY = Deno.env.get("NFEIO_API_KEY")!;

type SyncBody = { emissao_id?: string };

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function canManageNfe(userClient: any, svc: any, callerId: string, empresaId: string): Promise<boolean> {
  let allowed = false;
  try {
    const { data } = await userClient.rpc("has_permission_for_current_user", {
      p_module: "fiscal",
      p_action: "nfe_manage",
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

async function tryUploadFromUrl(admin: any, bucket: string, path: string, url: string, contentType: string) {
  const resp = await fetch(url);
  if (!resp.ok) return;
  const blob = await resp.blob();
  await admin.storage.from(bucket).upload(path, blob, { upsert: true, contentType });
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

  const body = (await req.json().catch(() => ({}))) as SyncBody;
  const emissaoId = (body.emissao_id ?? "").trim();
  if (!emissaoId) return json(400, { ok: false, error: "MISSING_EMISSAO_ID" }, cors);

  const { data: integration, error: intErr } = await admin
    .from("fiscal_nfe_nfeio_emissoes")
    .select("empresa_id,emissao_id,ambiente,nfeio_id")
    .eq("emissao_id", emissaoId)
    .maybeSingle();
  if (intErr || !integration?.emissao_id) return json(404, { ok: false, error: "NOT_LINKED_TO_NFEIO" }, cors);

  const empresaId = integration.empresa_id as string;
  const ambiente = (integration.ambiente ?? "homologacao") as NfeioEnvironment;
  const nfeioId = (integration.nfeio_id ?? "").toString();
  if (!nfeioId) return json(409, { ok: false, error: "MISSING_NFEIO_ID" }, cors);

  // RBAC: exige permissão ou OWNER/ADMIN no tenant da emissão
  const allowed = await canManageNfe(user, admin, userId, empresaId);
  if (!allowed) return json(403, { ok: false, error: "FORBIDDEN_RBAC" }, cors);

  const base = nfeioBaseUrl(ambiente);
  const url = `${base}/v2/nota-fiscal/${encodeURIComponent(nfeioId)}`;
  const result = await nfeioFetchJson(url, {
    method: "GET",
    headers: {
      "X-Api-Key": NFEIO_API_KEY,
      "Content-Type": "application/json",
    },
  });

  await admin.from("fiscal_nfe_nfeio_emissoes").update({
    response_payload: result.data ?? {},
    provider_status: result.data?.status ?? null,
    last_sync_at: new Date().toISOString(),
  }).eq("emissao_id", emissaoId);

  // Best-effort: baixar XML/DANFE se a API devolver links
  const maybeXmlUrl =
    result.data?.xmlUrl ?? result.data?.xml_url ?? result.data?.xml?.url ?? result.data?.links?.xml ?? null;
  const maybeDanfeUrl =
    result.data?.danfeUrl ?? result.data?.danfe_url ?? result.data?.danfe?.url ?? result.data?.links?.danfe ?? null;

  const updates: any = {};
  if (typeof maybeXmlUrl === "string" && maybeXmlUrl.startsWith("http")) {
    const path = `${empresaId}/${emissaoId}/nfeio.xml`;
    await tryUploadFromUrl(admin, "nfe_docs", path, maybeXmlUrl, "application/xml");
    updates.xml_storage_path = path;
  }
  if (typeof maybeDanfeUrl === "string" && maybeDanfeUrl.startsWith("http")) {
    const path = `${empresaId}/${emissaoId}/danfe.pdf`;
    await tryUploadFromUrl(admin, "nfe_docs", path, maybeDanfeUrl, "application/pdf");
    updates.danfe_storage_path = path;
  }
  if (Object.keys(updates).length > 0) {
    await admin.from("fiscal_nfe_nfeio_emissoes").update(updates).eq("emissao_id", emissaoId);
  }

  if (!result.ok) {
    await admin.from("fiscal_nfe_emissoes").update({
      status: "erro",
      last_error: JSON.stringify(result.data).slice(0, 900),
    }).eq("id", emissaoId);
    return json(502, { ok: false, error: "NFEIO_SYNC_FAILED", status: result.status, data: result.data }, cors);
  }

  // Atualiza status da emissão local de forma conservadora
  const nextStatus = (result.data?.status ?? "").toString().toLowerCase();
  if (nextStatus) {
    await admin.from("fiscal_nfe_emissoes").update({
      status: nextStatus,
      last_error: null,
    }).eq("id", emissaoId);
  }

  return json(200, { ok: true, data: result.data }, cors);
});
