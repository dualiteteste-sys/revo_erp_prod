import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ===== CORS (KISS) ===== */
const ALLOW_ALL_ORIGINS = (Deno.env.get("ALLOW_ALL_ORIGINS") ?? "true").toLowerCase() === "true";
function corsHeaders(origin: string | null) {
  if (ALLOW_ALL_ORIGINS || !origin || origin === "null") {
    return {
      "Access-Control-Allow-Origin": "*",
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Max-Age": "86400",
    };
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

/* ===== ENV ===== */
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL      = (Deno.env.get("SITE_URL") ?? "").trim();

/* ===== TYPES ===== */
type InvitePayload = { email?: string; role?: string; empresa_id?: string };
const asSlug = (s?: string) => (s ?? "").trim().toUpperCase();

type InviteAction = "invited" | "resent" | "link_only" | "noop";

function pickSiteUrl(req: Request): string {
  const origin = (req.headers.get("origin") ?? "").trim();
  const allowedExact = new Set<string>([
    "https://erprevo.com",
    "https://erprevodev.com",
    "http://localhost:5173",
  ]);

  const candidate = allowedExact.has(origin) ? origin : SITE_URL;
  if (allowedExact.has(candidate)) return candidate;
  return candidate || "http://localhost:5173";
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const CORS = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    /* ===== Autenticação do chamador ===== */
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: me } = await userClient.auth.getUser();
    if (!me?.user?.id) {
      return new Response(JSON.stringify({ ok: false, error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const callerId = me.user.id;

    /* ===== Payload ===== */
    const body = (await req.json().catch(() => ({}))) as InvitePayload;
    const email = (body.email ?? "").trim().toLowerCase();
    const roleSlug = asSlug(body.role) || "ADMIN";
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ ok: false, error: "INVALID_EMAIL" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    /* ===== Empresa alvo ===== */
    let empresaId: string | null = null;
    if (body.empresa_id) {
      const { data: emp } = await userClient.from("empresas").select("id").eq("id", body.empresa_id).maybeSingle();
      if (!emp?.id) {
        return new Response(JSON.stringify({ ok: false, error: "TENANT_NOT_ACCESSIBLE" }), {
          status: 403, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      empresaId = emp.id;
    } else {
      const { data: empId } = await userClient.rpc("current_empresa_id");
      if (!empId) {
        return new Response(JSON.stringify({ ok: false, error: "NO_ACTIVE_TENANT" }), {
          status: 403, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      empresaId = typeof empId === "string" ? empId : (empId as any)?.id ?? empId;
    }

    /* ===== RBAC ===== */
    let allowed = false;
    try {
      const { data: canManage } = await userClient.rpc("has_permission_for_current_user", {
        p_module: "usuarios", p_action: "manage",
      });
      allowed = !!canManage;
    } catch { /* ignore */ }

    if (!allowed) {
      const { data: link } = await svc
        .from("empresa_usuarios")
        .select("role_id")
        .eq("empresa_id", empresaId!)
        .eq("user_id", callerId)
        .maybeSingle();
      if (link?.role_id) {
        const { data: role } = await svc.from("roles").select("slug").eq("id", link.role_id).maybeSingle();
        if (role?.slug && (role.slug === "OWNER" || role.slug === "ADMIN")) allowed = true;
      }
    }
    if (!allowed) {
      return new Response(JSON.stringify({ ok: false, error: "FORBIDDEN_RBAC" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    /* ===== Role alvo ===== */
    const { data: roleRow } = await userClient
      .from("roles").select("id, slug").eq("slug", roleSlug).maybeSingle();
    if (!roleRow?.id) {
      return new Response(JSON.stringify({ ok: false, error: "INVALID_ROLE_SLUG" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    /* ===== Lógica de envio de e-mail ===== */
    const siteUrl = pickSiteUrl(req);
    // Importante: o usuário deve cair na tela de definir senha ao aceitar o convite (estado da arte, sem fricção).
    // Obs: este path precisa estar permitido em Auth → URL Configuration (Redirect URLs) no Supabase.
    const redirectTo = `${siteUrl}/auth/update-password?empresa_id=${encodeURIComponent(empresaId)}`;
    let userId: string | null = null;
    let emailSent = false;
    let action: InviteAction = "invited";
    let actionLink: string | null = null;

    // 1) Tenta convite padrão (NOVO usuário) → envia e-mail
    const { data: invitedRes, error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo,
    });

    if (!inviteErr && invitedRes?.user?.id) {
      userId = invitedRes.user.id;
      emailSent = true; // e-mail enviado pelo Auth
      action = "invited";
      console.log("[MAIL] inviteUserByEmail sent");
      // Mesmo quando o e-mail é enviado, geramos o link para permitir "copiar convite"
      // caso o destinatário não receba (spam, rate limit, SMTP, etc.).
      try {
        const { data: linkData } = await svc.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo },
        });
        actionLink = (linkData as any)?.properties?.action_link ?? null;
      } catch {
        actionLink = null;
      }
    } else {
      // 2) Usuário provavelmente já existe. Gerar link + disparar e-mail via OTP.
      const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (linkErr || !linkData?.user?.id) {
        console.error("[ADMIN] generateLink failed", { inviteErr, linkErr });
        return new Response(JSON.stringify({ ok: false, error: "ADMIN_LOOKUP_FAILED" }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      userId = linkData.user.id;
      actionLink = (linkData as any)?.properties?.action_link ?? null;

      // Dispara e-mail (EXISTENTE) usando o servidor de SMTP do projeto
      const { error: otpErr } = await svc.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (otpErr) {
        console.error("[MAIL] signInWithOtp failed", otpErr);
        // Se não conseguimos enviar e-mail, ainda assim seguimos sem travar:
        // retornamos o link para o admin copiar e enviar manualmente.
        emailSent = false;
        action = "link_only";
      } else {
        console.log("[MAIL] signInWithOtp sent");
        emailSent = true;
        action = "resent";
      }
    }

    /* ===== Upsert vínculo ===== */
    const svcDb = svc.from("empresa_usuarios");
    const { data: existing } = await svcDb
      .select("status")
      .eq("empresa_id", empresaId!)
      .eq("user_id", userId!)
      .maybeSingle();

    // Se já for ACTIVE, não mexe nem envia novo e-mail
    if (existing?.status === "ACTIVE") {
      return new Response(JSON.stringify({
        ok: true,
        action: "noop",
        action_link: null,
        data: { email, empresa_id: empresaId, role: roleSlug, status: "ACTIVE", action_link: null },
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Nunca marca ACTIVE sem o usuário ter completado o fluxo.
    // Se o e-mail não foi enviado, o admin ainda pode copiar o link para concluir.
    const nextStatus: "PENDING" = "PENDING";
    const { error: upsertErr } = await svcDb.upsert(
      { empresa_id: empresaId!, user_id: userId!, role_id: roleRow.id, status: nextStatus },
      { onConflict: "empresa_id,user_id" },
    );
    if (upsertErr) {
      console.error("[UPSERT] empresa_usuarios", upsertErr);
      return new Response(JSON.stringify({ ok: false, error: "LINK_UPSERT_FAILED" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      action,
      action_link: actionLink,
      data: { email, empresa_id: empresaId, role: roleSlug, status: nextStatus, action_link: actionLink },
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[UNEXPECTED_ERROR]", err);
    return new Response(JSON.stringify({
      ok: false,
      error: "UNEXPECTED_ERROR",
      detail: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { ...corsHeaders(req.headers.get("origin")), "Content-Type": "application/json" } });
  }
});
