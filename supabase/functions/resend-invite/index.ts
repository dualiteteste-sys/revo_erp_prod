// supabase/functions/resend-invite/index.ts
// Reenvio de convite: envia e-mail para usuário existente (OTP) ou novo (inviteUserByEmail).
// RBAC: exige 'usuarios:manage' ou fallback OWNER/ADMIN no tenant atual.
// Logs: [AUTH] [RBAC] [MAIL] [ADMIN]

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL      = (Deno.env.get("SITE_URL") ?? "").trim();

type Payload = { email?: string; user_id?: string; empresa_id?: string };

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
  const CORS = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    // --- Autenticação do chamador
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

    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user?.id) {
      return new Response(JSON.stringify({ ok: false, error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const callerId = me.user.id as string;

    // --- Payload
    const body = (await req.json().catch(() => ({}))) as Payload;
    const reqEmail = (body.email ?? "").trim().toLowerCase();
    const reqUserId = (body.user_id ?? "").trim();

    if (!reqEmail && !reqUserId) {
      return new Response(JSON.stringify({ ok: false, error: "MISSING_TARGET" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // --- Tenant alvo
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

    // --- RBAC: permissão OU OWNER/ADMIN no tenant
    let allowed = false;
    try {
      const { data: canManage } = await userClient.rpc("has_permission_for_current_user", {
        p_module: "usuarios", p_action: "manage",
      });
      allowed = !!canManage;
    } catch { /* ignore */ }

    if (!allowed) {
      const { data: link } = await svc
        .from("empresa_usuarios").select("role_id")
        .eq("empresa_id", empresaId!).eq("user_id", callerId).maybeSingle();
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

    // --- Resolver e-mail/user_id
    let email = reqEmail;
    let userId = reqUserId || null;

    if (!email && userId) {
      // Admin API para buscar e-mail do user_id
      const { data: userById, error } = await svc.auth.admin.getUserById(userId);
      if (error || !userById?.user?.email) {
        return new Response(JSON.stringify({ ok: false, error: "USER_LOOKUP_FAILED" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      email = userById.user.email.toLowerCase();
    }

    const siteUrl = pickSiteUrl(req);
    // Importante: reenvio deve cair em "Definir senha" (mesmo flow do convite).
    // Obs: este path precisa estar permitido em Auth → URL Configuration (Redirect URLs) no Supabase.
    const redirectTo = `${siteUrl}/auth/update-password?empresa_id=${encodeURIComponent(empresaId)}`;

    // --- Tenta convidar NOVO usuário (envia e-mail)
    let action: "invited" | "resent" = "resent";
    let emailSent = false;

    const { data: invitedRes, error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo,
    });

    if (!inviteErr && invitedRes?.user?.id) {
      userId = invitedRes.user.id;
      emailSent = true;
      action = "invited";
      console.log("[MAIL] inviteUserByEmail sent");
    } else {
      // Usuário já existe → envia e-mail com magic link
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

      const { error: otpErr } = await svc.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      if (otpErr) {
        console.error("[MAIL] signInWithOtp failed", otpErr);
        return new Response(JSON.stringify({ ok: false, error: "MAIL_SEND_FAILED" }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      emailSent = true;
      action = "resent";
      console.log("[MAIL] signInWithOtp sent");
    }

    // --- Garantir que o vínculo existe e fica PENDING
    const svcDb = svc.from("empresa_usuarios");
    const { data: existing } = await svcDb
      .select("status").eq("empresa_id", empresaId!).eq("user_id", userId!).maybeSingle();

    const nextStatus = emailSent ? "PENDING" : (existing?.status ?? "PENDING");
    
    if (existing) {
        const { error: updateError } = await svcDb
            .update({ status: nextStatus })
            .eq('empresa_id', empresaId!)
            .eq('user_id', userId!);
        if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({
      ok: true,
      action,
      data: { email, empresa_id: empresaId, status: nextStatus },
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
