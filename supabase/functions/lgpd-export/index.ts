import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ExportBody = {
  subject_type?: "user";
};

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = (await req.json().catch(() => ({}))) as ExportBody;
  const subjectType = body.subject_type ?? "user";
  if (subjectType !== "user") return json(400, { ok: false, error: "INVALID_SUBJECT_TYPE" }, cors);

  const { data: me } = await user.auth.getUser();
  const userId = me?.user?.id ?? null;
  const email = me?.user?.email ?? null;
  if (!userId) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const { data: empresaId, error: empErr } = await user.rpc("current_empresa_id");
  if (empErr || !empresaId) return json(403, { ok: false, error: "NO_ACTIVE_EMPRESA" }, cors);

  const requestId = crypto.randomUUID();

  const { data: created, error: createErr } = await admin
    .from("lgpd_exports")
    .insert({
      empresa_id: empresaId,
      requester_id: userId,
      subject_type: "user",
      subject_id: userId,
      status: "pending",
      meta: { request_id: requestId },
    })
    .select("id")
    .single();

  if (createErr || !created?.id) {
    return json(500, { ok: false, error: "CREATE_EXPORT_FAILED", details: createErr?.message }, cors);
  }

  const exportId = created.id as string;
  const filePath = `${empresaId}/lgpd/${userId}/${exportId}.json`;

  try {
    // Dados mínimos e úteis (sem segredos):
    // - dados do usuário (Auth)
    // - empresa ativa
    // - vínculos e preferências
    // - assinatura (se existir)
    const { data: empresa } = await admin
      .from("empresas")
      .select("*")
      .eq("id", empresaId)
      .maybeSingle();

    const { data: empresaUsuario } = await admin
      .from("empresa_usuarios")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("user_id", userId)
      .maybeSingle();

    const { data: activeEmpresaPref } = await admin
      .from("user_active_empresa")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("*")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const payload = {
      meta: {
        schema: "lgpd_export_v1",
        generated_at: new Date().toISOString(),
        empresa_id: empresaId,
        requester_id: userId,
        subject_type: "user",
        subject_id: userId,
        request_id: requestId,
      },
      auth_user: {
        id: userId,
        email,
        created_at: me?.user?.created_at ?? null,
        last_sign_in_at: (me?.user as any)?.last_sign_in_at ?? null,
        user_metadata: me?.user?.user_metadata ?? null,
        app_metadata: me?.user?.app_metadata ?? null,
      },
      empresa: empresa ?? null,
      empresa_usuario: empresaUsuario ?? null,
      user_active_empresa: activeEmpresaPref ?? null,
      subscription: subscription ?? null,
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });

    const up = await admin.storage.from("lgpd_exports").upload(filePath, blob, {
      upsert: true,
      contentType: "application/json",
    });
    if (up.error) throw new Error(up.error.message);

    await admin.from("lgpd_exports").update({
      status: "done",
      file_path: filePath,
      completed_at: new Date().toISOString(),
      meta: { request_id: requestId, bytes: jsonStr.length },
      error_message: null,
    }).eq("id", exportId);

    return json(200, { ok: true, export_id: exportId, file_path: filePath }, cors);
  } catch (e) {
    await admin.from("lgpd_exports").update({
      status: "error",
      error_message: String(e).slice(0, 900),
      completed_at: new Date().toISOString(),
    }).eq("id", exportId);

    return json(500, { ok: false, error: "EXPORT_FAILED", export_id: exportId }, cors);
  }
});

