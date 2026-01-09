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
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-revo-request-id",
      "Access-Control-Max-Age": "86400",
    };
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-revo-request-id",
    "Access-Control-Max-Age": "86400",
  };
}

/* ===== ENV ===== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Payload = {
  email?: string;
  password?: string;
  role?: string;
  empresa_id?: string;
};

const asSlug = (s?: string) => (s ?? "").trim().toUpperCase();

async function findUserIdByEmail(svc: any, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const perPage = 200;
  const maxPages = 10;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = (data as any)?.users ?? [];
    const found = users.find((u: any) => (u?.email ?? "").toLowerCase() === normalized);
    if (found?.id) return found.id;
    if (!Array.isArray(users) || users.length < perPage) break;
  }
  return null;
}

function isRetryableLinkError(err: any): boolean {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  // Possível race: auth.users ainda não visível no PostgREST no exato ms após createUser → FK 23503
  if (code === "23503") return true;
  if (msg.includes("foreign key") || msg.includes("violates foreign key")) return true;
  // PostgREST pode responder “schema cache”/transient errors; manter conservador.
  if (msg.includes("timeout") || msg.includes("tempor") || msg.includes("could not") || msg.includes("try again")) return true;
  return false;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const CORS = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const callerId = me.user.id;

    const body = (await req.json().catch(() => ({}))) as Payload;
    const email = (body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const roleSlug = asSlug(body.role) || "VIEWER";

    if (!email || !email.includes("@") || password.length < 8) {
      return new Response(JSON.stringify({ ok: false, error: "INVALID_PAYLOAD" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Empresa alvo
    let empresaId: string | null = null;
    if (body.empresa_id) {
      const { data: emp } = await userClient.from("empresas").select("id").eq("id", body.empresa_id).maybeSingle();
      if (!emp?.id) {
        return new Response(JSON.stringify({ ok: false, error: "TENANT_NOT_ACCESSIBLE" }), {
          status: 403,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      empresaId = emp.id;
    } else {
      const { data: empId } = await userClient.rpc("current_empresa_id");
      if (!empId) {
        return new Response(JSON.stringify({ ok: false, error: "NO_ACTIVE_TENANT" }), {
          status: 403,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      empresaId = typeof empId === "string" ? empId : (empId as any)?.id ?? empId;
    }

    // RBAC: usuários.manage OU fallback OWNER/ADMIN
    let allowed = false;
    try {
      const { data: canManage } = await userClient.rpc("has_permission_for_current_user", {
        p_module: "usuarios",
        p_action: "manage",
      });
      allowed = !!canManage;
    } catch {
      // ignore
    }

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
      return new Response(JSON.stringify({ ok: false, error: "PERMISSION_DENIED" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Role alvo
    const { data: roleRow } = await userClient.from("roles").select("id, slug").eq("slug", roleSlug).maybeSingle();
    if (!roleRow?.id) {
      return new Response(JSON.stringify({ ok: false, error: "INVALID_ROLE_SLUG" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Segurança: "manual create" não deve resetar senha de usuário existente.
    const existingUserId = await findUserIdByEmail(svc, email).catch(() => null);
    if (existingUserId) {
      return new Response(JSON.stringify({ ok: false, error: "USER_ALREADY_EXISTS" }), {
        status: 409,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        must_change_password: true,
        pending_empresa_id: empresaId,
        created_via: "manual",
        created_by: callerId,
      },
    });
    if (createErr || !created?.user?.id) {
      console.error("[AUTH] admin.createUser failed", createErr);
      return new Response(JSON.stringify({ ok: false, error: "AUTH_CREATE_FAILED" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const userId = created.user.id as string;

    // Upsert vínculo: robusto contra eventual race do FK (auth.users) logo após createUser.
    const retries = [0, 120, 350, 800, 1500];
    let lastErr: any = null;
    for (let i = 0; i < retries.length; i++) {
      if (retries[i] > 0) await sleep(retries[i]);
      const { error: upsertErr } = await svc.from("empresa_usuarios").upsert(
        {
          empresa_id: empresaId,
          user_id: userId,
          role_id: roleRow.id,
          status: "PENDING",
        },
        { onConflict: "empresa_id,user_id" },
      );
      if (!upsertErr) {
        lastErr = null;
        break;
      }
      lastErr = upsertErr;
      if (!isRetryableLinkError(upsertErr)) break;
    }

    if (lastErr) {
      console.error("[DB] upsert empresa_usuarios failed", lastErr);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "LINK_FAILED",
          detail: (lastErr as any)?.message ?? String(lastErr),
          code: (lastErr as any)?.code ?? null,
          hint: (lastErr as any)?.hint ?? null,
          details: (lastErr as any)?.details ?? null,
        }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({
      ok: true,
      user_id: userId,
      email,
      empresa_id: empresaId,
      role: roleSlug,
      status: "PENDING",
      must_change_password: true,
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
